from fastapi import APIRouter, HTTPException

from app.core.config import capability_status, get_settings

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str | bool]:
    settings = get_settings()
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.app_version,
        **capability_status(),
    }


@router.get("/api/v1/settings")
def get_runtime_settings() -> dict[str, bool]:
    return capability_status()


@router.post("/api/v1/settings/demo-mode")
def update_demo_mode() -> None:
    raise HTTPException(status_code=404, detail="Demo mode is deployment configuration")
