from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.config import capability_status, get_settings, set_demo_mode

router = APIRouter()


class DemoModeRequest(BaseModel):
    enabled: bool = Field(description="true keeps the sample-only path; false enables AI analysis")


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
def update_demo_mode(request: DemoModeRequest) -> dict[str, bool]:
    try:
        return set_demo_mode(request.enabled)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
