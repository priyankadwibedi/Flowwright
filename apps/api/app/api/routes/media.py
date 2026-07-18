import asyncio
import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.core.config import get_settings
from app.models.workflow import ProcessedDemonstration
from app.services.evidence_processor import parse_event_log_json, process_demonstration
from app.services.keyframe_extractor import KeyframeExtractionError, extract_keyframes

router = APIRouter(prefix="/api/v1/media", tags=["media"])
SUPPORTED_TYPES = {"video/webm": ".webm", "video/mp4": ".mp4", "video/quicktime": ".mov"}
EXTENSION_SUFFIXES = {".webm": ".webm", ".mp4": ".mp4", ".mov": ".mov"}


def _resolve_video_suffix(content_type: str | None, filename: str | None) -> str | None:
    """Accept bare types and MediaRecorder variants like video/webm;codecs=vp9,opus."""
    normalized = (content_type or "").split(";", 1)[0].strip().lower()
    if normalized in SUPPORTED_TYPES:
        return SUPPORTED_TYPES[normalized]
    name = (filename or "").lower()
    for extension, suffix in EXTENSION_SUFFIXES.items():
        if name.endswith(extension):
            return suffix
    return None


async def _read_video(file: UploadFile) -> tuple[bytes, str]:
    settings = get_settings()
    suffix = _resolve_video_suffix(file.content_type, file.filename)
    if not suffix:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Upload a WebM, MP4, or QuickTime video",
        )
    content = await file.read(settings.max_upload_size_mb * 1024 * 1024 + 1)
    if len(content) > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Video exceeds the {settings.max_upload_size_mb} MB limit",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Video upload is empty",
        )
    return content, suffix


@router.post("/keyframes")
async def keyframes(file: UploadFile = File(...)) -> dict[str, object]:  # noqa: B008
    settings = get_settings()
    content, suffix = await _read_video(file)
    try:
        duration, frames = await asyncio.to_thread(
            extract_keyframes,
            _Reader(content),
            suffix,
            settings.max_keyframes,
            settings.max_frame_width,
            settings.jpeg_quality,
        )
    except KeyframeExtractionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    if duration > settings.max_video_duration_seconds:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Video duration exceeds the configured maximum",
        )
    for frame in frames:
        if frame.width > settings.max_decoded_width or frame.height > settings.max_decoded_height:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Decoded frame resolution exceeds the configured maximum",
            )
        if len(frame.image_base64) > settings.max_base64_frame_chars:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Frame payload exceeds the configured maximum",
            )
    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "duration_seconds": duration,
        "frame_count": len(frames),
        "frames": [frame.model_dump() for frame in frames],
    }


@router.post("/process-demonstration", response_model=ProcessedDemonstration)
async def process_uploaded_demonstration(
    file: UploadFile = File(...),  # noqa: B008
    event_log: str | None = Form(default=None),  # noqa: B008
    task_description: str | None = Form(default=None),  # noqa: B008
) -> ProcessedDemonstration:
    del task_description  # Included for forward-compatible multipart clients.
    settings = get_settings()
    content, suffix = await _read_video(file)
    try:
        events = parse_event_log_json(event_log)
        if len(events) > settings.max_browser_events:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Browser event log exceeds {settings.max_browser_events} events",
            )
        result = await asyncio.wait_for(
            asyncio.to_thread(process_demonstration, content, suffix, settings, events),
            timeout=settings.processing_timeout_seconds,
        )
    except TimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Demonstration processing timed out",
        ) from exc
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except KeyframeExtractionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    if len(result.evidence_timeline) > settings.max_evidence_items:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Evidence timeline exceeds the configured maximum",
        )
    if len(result.transcript) > settings.max_transcript_chars:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Transcript exceeds the configured maximum",
        )
    return result


class _Reader:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.offset = 0

    def read(self, size: int = -1) -> bytes:
        size = len(self.data) - self.offset if size < 0 else size
        result = self.data[self.offset : self.offset + size]
        self.offset += len(result)
        return result
