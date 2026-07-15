from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.core.config import get_settings
from app.services.keyframe_extractor import KeyframeExtractionError, extract_keyframes

router = APIRouter(prefix="/api/v1/media", tags=["media"])
SUPPORTED_TYPES = {"video/webm": ".webm", "video/mp4": ".mp4", "video/quicktime": ".mov"}


@router.post("/keyframes")
async def keyframes(file: UploadFile = File(...)) -> dict[str, object]:  # noqa: B008
    settings = get_settings()
    suffix = SUPPORTED_TYPES.get(file.content_type or "")
    if not suffix:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Upload a WebM, MP4, or QuickTime video",
        )
    limit = settings.max_upload_size_mb * 1024 * 1024
    content = await file.read(limit + 1)
    if len(content) > limit:
        raise HTTPException(
            status_code=413, detail=f"Video exceeds the {settings.max_upload_size_mb} MB limit"
        )

    class Reader:
        def __init__(self, data: bytes) -> None:
            self.data, self.offset = data, 0

        def read(self, size: int = -1) -> bytes:
            size = len(self.data) - self.offset if size < 0 else size
            result = self.data[self.offset : self.offset + size]
            self.offset += len(result)
            return result

    try:
        frames = extract_keyframes(Reader(content), suffix, settings.max_keyframes)
    except KeyframeExtractionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "frame_count": len(frames),
        "frames": frames,
    }
