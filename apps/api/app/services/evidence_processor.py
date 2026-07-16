"""Turn an uploaded demonstration into bounded, timestamped evidence."""

import json
import logging
import os
import shutil
import subprocess
import tempfile
from collections.abc import Mapping
from contextlib import suppress
from datetime import UTC, datetime
from pathlib import Path

from openai import OpenAI

from app.core.config import Settings
from app.models.workflow import (
    BrowserEvent,
    EvidenceItem,
    MetadataEntry,
    ProcessedDemonstration,
    TranscriptSegment,
)
from app.services.keyframe_extractor import extract_keyframes

logger = logging.getLogger(__name__)


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


def _transcribe(
    audio_bytes: bytes | None,
    settings: Settings,
) -> tuple[str, list[TranscriptSegment], str]:
    if not settings.openai_api_key:
        return "", [], "unavailable"
    if not audio_bytes:
        return "", [], "unavailable"
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
            response = client.audio.transcriptions.create(
                model=settings.openai_transcription_model,
                file=source,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )
        transcript = str(getattr(response, "text", "") or "").strip()
        segments: list[TranscriptSegment] = []
        for index, raw_segment in enumerate(getattr(response, "segments", None) or []):
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
        return transcript, segments, "available" if transcript else "failed"
    except Exception:  # API-specific errors are intentionally not exposed to clients.
        logger.exception("transcription request failed")
        return "", [], "failed"
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
    transcript, transcript_segments, transcription_status = _transcribe(audio_bytes, settings)
    evidence: list[EvidenceItem] = []
    for frame in frames:
        evidence.append(
            EvidenceItem(
                id=frame.id,
                timestamp_seconds=frame.timestamp_seconds,
                source="frame",
                content=f"Video frame at {frame.timestamp_seconds:.3f}s",
                image_base64=frame.image_base64,
                metadata=[
                    MetadataEntry(key="frame_index", value=str(frame.frame_index)),
                    MetadataEntry(key="width", value=str(frame.width)),
                    MetadataEntry(key="height", value=str(frame.height)),
                ],
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
            )
        )
    evidence.sort(key=lambda item: (item.timestamp_seconds, item.id))
    return ProcessedDemonstration(
        duration_seconds=duration,
        frames=frames,
        transcript=transcript,
        transcript_segments=transcript_segments,
        transcription_status=transcription_status,  # type: ignore[arg-type]
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
