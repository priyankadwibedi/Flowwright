"""Turn an uploaded demonstration into bounded, timestamped evidence."""

import json
import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from collections.abc import Mapping
from contextlib import suppress
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI, RateLimitError

from app.core.config import Settings
from app.models.workflow import (
    BrowserEvent,
    EvidenceItem,
    MetadataEntry,
    ProcessedDemonstration,
    TranscriptionStatus,
    TranscriptSegment,
)
from app.services.keyframe_extractor import extract_keyframes

logger = logging.getLogger(__name__)

GPT_TRANSCRIBE_MODELS = frozenset({"gpt-4o-transcribe", "gpt-4o-mini-transcribe"})
WHISPER_MODELS = frozenset({"whisper-1"})
SUPPORTED_TRANSCRIPTION_MODELS = GPT_TRANSCRIBE_MODELS | WHISPER_MODELS


class TranscriptionConfigError(ValueError):
    """Raised when transcription settings are invalid."""


def validate_transcription_model(model: str) -> str:
    if model not in SUPPORTED_TRANSCRIPTION_MODELS:
        raise TranscriptionConfigError(
            f"Unsupported transcription model '{model}'. "
            f"Supported: {sorted(SUPPORTED_TRANSCRIPTION_MODELS)}"
        )
    return model


def _normalise_events(raw_events: list[Mapping[str, object]] | None) -> list[BrowserEvent]:
    """Accept the extension contract and the original prototype's small event shape."""
    events: list[BrowserEvent] = []
    default_time = datetime.now(UTC)
    for index, raw in enumerate(raw_events or []):
        value = dict(raw)
        timestamp_value = value.get("timestamp")
        if not isinstance(timestamp_value, str):
            timestamp_value = default_time.isoformat()
        event_type = str(value.get("type", "navigation"))
        if event_type not in {"click", "input", "navigation", "submit"}:
            event_type = "navigation"
        events.append(
            BrowserEvent(
                id=str(value.get("id") or f"event-{index + 1}"),
                timestamp=timestamp_value,
                elapsed_ms=int(value.get("elapsed_ms") or 0),
                tab_id=int(value.get("tab_id") or 0),
                url=str(value.get("url") or ""),
                type=event_type,  # type: ignore[arg-type]
                selector=str(value.get("selector") or ""),
                element_role=str(value["element_role"]) if value.get("element_role") else None,
                label=str(value["label"]) if value.get("label") else None,
                value_policy=str(value.get("value_policy") or "omitted"),  # type: ignore[arg-type]
                value=str(value["value"]) if value.get("value") is not None else None,
                description=str(value["description"]) if value.get("description") else None,
            )
        )
    return events


def _extract_audio(video_bytes: bytes, suffix: str) -> tuple[bytes | None, str]:
    """Extract a temporary mono WAV using a fixed ffmpeg invocation."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None, "unavailable"
    video_path: Path | None = None
    audio_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as video_file:
            video_file.write(video_bytes)
            video_path = Path(video_file.name)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as audio_file:
            audio_path = Path(audio_file.name)
        result = subprocess.run(
            [
                ffmpeg,
                "-v",
                "error",
                "-i",
                str(video_path),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-f",
                "wav",
                "-y",
                str(audio_path),
            ],
            capture_output=True,
            check=False,
            timeout=60,
        )
        if result.returncode != 0 or not audio_path.exists() or audio_path.stat().st_size == 0:
            return None, "missing"
        return audio_path.read_bytes(), "available"
    except (OSError, subprocess.SubprocessError):
        return None, "unavailable"
    finally:
        for path in (video_path, audio_path):
            if path is not None:
                with suppress(FileNotFoundError):
                    os.unlink(path)


def build_transcription_request_kwargs(model: str) -> dict[str, Any]:
    """Return provider kwargs for the configured transcription model."""
    validate_transcription_model(model)
    if model in GPT_TRANSCRIBE_MODELS:
        return {"model": model, "response_format": "json"}
    return {
        "model": model,
        "response_format": "verbose_json",
        "timestamp_granularities": ["segment"],
    }


def _map_transcription_error(exc: Exception) -> TranscriptionStatus:
    if isinstance(exc, RateLimitError):
        logger.warning("transcription_failed category=rate_limit")
        return "rate_limited"
    if isinstance(exc, APITimeoutError):
        logger.warning("transcription_failed category=timeout")
        return "timeout"
    if isinstance(exc, APIConnectionError):
        logger.warning("transcription_failed category=provider_connection")
        return "failed"
    if isinstance(exc, APIStatusError):
        logger.warning(
            "transcription_failed category=provider_status status=%s",
            getattr(exc, "status_code", None),
        )
        return "failed"
    logger.warning(
        "transcription_failed category=invalid_or_unexpected error_type=%s",
        type(exc).__name__,
    )
    return "invalid_response"


def _transcribe(
    audio_bytes: bytes | None,
    settings: Settings,
    duration_seconds: float = 0.0,
) -> tuple[str, list[TranscriptSegment], TranscriptionStatus]:
    if not settings.openai_api_key:
        return "", [], "missing_api_key"
    if not audio_bytes:
        return "", [], "missing_audio"

    try:
        request_kwargs = build_transcription_request_kwargs(settings.openai_transcription_model)
    except TranscriptionConfigError:
        logger.error(
            "transcription_failed category=invalid_config model=%s",
            settings.openai_transcription_model,
        )
        return "", [], "failed"

    audio_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as audio_file:
            audio_file.write(audio_bytes)
            audio_path = Path(audio_file.name)
        client = OpenAI(
            api_key=settings.openai_api_key,
            timeout=settings.openai_timeout_seconds,
            max_retries=settings.openai_max_retries,
        )
        with audio_path.open("rb") as source:
            response = client.audio.transcriptions.create(file=source, **request_kwargs)

        transcript = str(getattr(response, "text", "") or "").strip()
        if not transcript and isinstance(response, dict):
            transcript = str(response.get("text") or "").strip()
        if not transcript:
            return "", [], "invalid_response"

        segments: list[TranscriptSegment] = []
        model = settings.openai_transcription_model
        if model in WHISPER_MODELS:
            raw_segments = getattr(response, "segments", None)
            if raw_segments is None and isinstance(response, dict):
                raw_segments = response.get("segments")
            for index, raw_segment in enumerate(raw_segments or []):
                if isinstance(raw_segment, dict):
                    start = float(raw_segment.get("start", 0.0) or 0.0)
                    end = float(raw_segment.get("end", start) or start)
                    text = str(raw_segment.get("text", "") or "").strip()
                else:
                    start = float(getattr(raw_segment, "start", 0.0) or 0.0)
                    end = float(getattr(raw_segment, "end", start) or start)
                    text = str(getattr(raw_segment, "text", "") or "").strip()
                if text:
                    segments.append(
                        TranscriptSegment(
                            id=f"speech-{index + 1}",
                            start_seconds=max(0.0, start),
                            end_seconds=max(start, end),
                            text=text,
                        )
                    )
        else:
            # GPT transcribe models: one synthetic segment covering the audio duration.
            end = max(duration_seconds, 0.0)
            segments.append(
                TranscriptSegment(
                    id="speech-1",
                    start_seconds=0.0,
                    end_seconds=end,
                    text=transcript,
                )
            )
        return transcript, segments, "available"
    except (RateLimitError, APITimeoutError, APIConnectionError, APIStatusError) as exc:
        return "", [], _map_transcription_error(exc)
    except Exception as exc:  # noqa: BLE001 - map unexpected provider payloads
        return "", [], _map_transcription_error(exc)
    finally:
        if audio_path is not None:
            with suppress(FileNotFoundError):
                os.unlink(audio_path)


def process_demonstration(
    video_bytes: bytes,
    suffix: str,
    settings: Settings,
    raw_events: list[Mapping[str, object]] | None = None,
) -> ProcessedDemonstration:
    duration, frames = extract_keyframes(
        io_bytes(video_bytes),
        suffix,
        settings.max_keyframes,
        max_width=settings.max_frame_width,
        jpeg_quality=settings.jpeg_quality,
    )
    browser_events = _normalise_events(raw_events)
    audio_bytes, audio_status = _extract_audio(video_bytes, suffix)
    transcript, transcript_segments, transcription_status = _transcribe(
        audio_bytes, settings, duration_seconds=duration
    )
    evidence: list[EvidenceItem] = []
    for frame in frames:
        evidence.append(
            EvidenceItem(
                id=frame.id,
                timestamp_seconds=frame.timestamp_seconds,
                source="frame",
                content=f"Video frame at {frame.timestamp_seconds:.3f}s",
                frame_id=frame.id,
                image_base64=None,
                metadata=[
                    MetadataEntry(key="frame_index", value=str(frame.frame_index)),
                    MetadataEntry(key="width", value=str(frame.width)),
                    MetadataEntry(key="height", value=str(frame.height)),
                ],
                observation_kind="direct",
                confidence=1.0,
            )
        )
    for event in browser_events:
        evidence.append(
            EvidenceItem(
                id=event.id,
                timestamp_seconds=min(duration, max(0.0, event.elapsed_ms / 1000)),
                source="browser_event",
                content=event.description or f"{event.type} on {event.selector or event.url}",
                metadata=[
                    MetadataEntry(key="url", value=event.url),
                    MetadataEntry(key="policy", value=event.value_policy),
                ],
                observation_kind="direct",
                confidence=1.0,
            )
        )
    for segment in transcript_segments:
        evidence.append(
            EvidenceItem(
                id=segment.id,
                timestamp_seconds=segment.start_seconds,
                source="speech",
                content=segment.text,
                metadata=[MetadataEntry(key="end_seconds", value=str(segment.end_seconds))],
                observation_kind="direct",
                confidence=1.0,
            )
        )
    evidence.sort(key=lambda item: (item.timestamp_seconds, item.id))
    return ProcessedDemonstration(
        demonstration_id=str(uuid.uuid4()),
        duration_seconds=duration,
        frames=frames,
        transcript=transcript,
        transcript_segments=transcript_segments,
        transcription_status=transcription_status,
        audio_status=audio_status,  # type: ignore[arg-type]
        browser_events=browser_events,
        evidence_timeline=evidence,
    )


def io_bytes(data: bytes):
    """Keep the extractor dependency on a file-like object without exposing IO details."""
    from io import BytesIO

    return BytesIO(data)


def parse_event_log_json(value: str | None) -> list[Mapping[str, object]]:
    if not value:
        return []
    parsed = json.loads(value)
    if not isinstance(parsed, list) or any(not isinstance(item, dict) for item in parsed):
        raise ValueError("Event log must be a JSON array of objects")
    return parsed
