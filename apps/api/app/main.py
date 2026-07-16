from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health, media, workflows
from app.core.config import get_settings
from app.core.logging import configure_logging

settings = get_settings()
configure_logging(settings.log_level)
app = FastAPI(
    title="Flowwright API",
    version=settings.app_version,
    description="Browser workflow compiler API",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str]:
    """Provide a friendly landing response for the deployed API hostname."""
    return {
        "service": settings.app_name,
        "status": "ok",
        "health": "/health",
        "docs": "/docs",
    }


app.include_router(health.router)
app.include_router(workflows.router)
app.include_router(workflows.invoices_router)
app.include_router(media.router)
