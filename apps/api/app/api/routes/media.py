import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.core.config import get_settings
from app.models.workflow import ProcessedDemonstration
from app.services.evidence_processor import parse_event_log_json, process_demonstration
from app.services.keyframe_extractor import KeyframeExtractionError, extract_keyframes

router = APIRouter(prefix="/api/v1/media", tags=["media"])
SUPPORTED_TYPES = {"video/webm": ".webm", "video/mp4": ".mp4", "video/quicktime": ".mov"}


async def _read_video(file: UploadFile) -> tuple[bytes, str]:
    settings = get_settings()
    suffix = SUPPORTED_TYPES.get(file.content_type or "")
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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Video upload is empty",
        )
    return content, suffix


@router.post("/keyframes")
async def keyframes(file: UploadFile = File(...)) -> dict[str, object]:  # noqa: B008
    settings = get_settings()
    content, suffix = await _read_video(file)
    try:
        duration, frames = extract_keyframes(
            _Reader(content),
            suffix,
            settings.max_keyframes,
            max_width=settings.max_frame_width,
            jpeg_quality=settings.jpeg_quality,
        )
    except KeyframeExtractionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
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
        return process_demonstration(content, suffix, settings, events)
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except KeyframeExtractionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


class _Reader:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.offset = 0

    def read(self, size: int = -1) -> bytes:
        size = len(self.data) - self.offset if size < 0 else size
        result = self.data[self.offset : self.offset + size]
        self.offset += len(result)
        return result
