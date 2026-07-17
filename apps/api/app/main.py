from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health, media, workflows
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.security import RequestGuardMiddleware

settings = get_settings()
configure_logging(settings.log_level)
app = FastAPI(
    title="Flowwright API",
    version=settings.app_version,
    description="Browser workflow compiler API",
)
app.add_middleware(RequestGuardMiddleware, settings=settings)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str | bool]:
    """Provide a friendly landing response for the deployed API hostname."""
    current = get_settings()
    return {
        "service": current.app_name,
        "status": "ok",
        "health": "/health",
        "docs": "/docs",
        "transcription_enabled": current.transcription_enabled,
        "ai_analysis_enabled": current.ai_analysis_enabled,
        "demo_mode": current.effective_demo_mode,
        "openai_configured": current.openai_configured,
        "retain_media": current.retain_media,
    }


app.include_router(health.router)
app.include_router(workflows.router)
app.include_router(workflows.invoices_router)
app.include_router(media.router)
