"""Runtime settings loaded from environment variables or a local .env file."""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SUPPORTED_TRANSCRIPTION_MODELS = frozenset(
    {"gpt-4o-transcribe", "gpt-4o-mini-transcribe", "whisper-1"}
)

# Runtime override so operators can flip demo mode without restarting.
_demo_mode_override: bool | None = None

_API_ROOT = Path(__file__).resolve().parents[2]
_REPO_ROOT = Path(__file__).resolve().parents[4]


def _resolve_env_files() -> tuple[str, ...]:
    """Load repo-root .env first, then apps/api/.env (local overrides win)."""
    candidates = (_REPO_ROOT / ".env", _API_ROOT / ".env")
    existing = tuple(str(path) for path in candidates if path.is_file())
    return existing or (str(_API_ROOT / ".env"),)


class Settings(BaseSettings):
    app_name: str = "flowwright-api"
    app_version: str = "0.1.0"
    flowwright_demo_mode: bool = False
    openai_api_key: str | None = None
    openai_model: str = ""
    openai_transcription_model: str = "gpt-4o-mini-transcribe"
    openai_timeout_seconds: float = Field(default=45.0, gt=0, le=300)
    openai_max_retries: int = Field(default=2, ge=0, le=5)
    cors_allowed_origins: str = "http://localhost:3000"
    max_upload_size_mb: int = Field(default=50, ge=1, le=500)
    max_json_body_bytes: int = Field(default=2_000_000, ge=32_768, le=20_000_000)
    max_browser_events: int = Field(default=500, ge=1, le=2_000)
    max_evidence_items: int = Field(default=200, ge=1, le=2_000)
    max_screenshot_count: int = Field(default=8, ge=1, le=16)
    max_base64_frame_chars: int = Field(default=400_000, ge=10_000, le=2_000_000)
    max_transcript_chars: int = Field(default=20_000, ge=1_000, le=100_000)
    max_video_duration_seconds: float = Field(default=600.0, gt=0, le=3_600)
    max_decoded_width: int = Field(default=1920, ge=320, le=3840)
    max_decoded_height: int = Field(default=1080, ge=240, le=2160)
    processing_timeout_seconds: float = Field(default=90.0, gt=1, le=300)
    rate_limit_requests: int = Field(default=60, ge=1, le=1_000)
    rate_limit_window_seconds: int = Field(default=60, ge=1, le=3_600)
    anonymous_daily_quota: int = Field(default=100, ge=1, le=10_000)
    hackathon_access_token: str | None = None
    retain_media: bool = False
    max_keyframes: int = Field(default=8, ge=1, le=8)
    max_frame_width: int = Field(default=1280, ge=320, le=1920)
    jpeg_quality: int = Field(default=75, ge=50, le=95)
    database_url: str = "sqlite:///./flowwright.db"
    log_level: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=_resolve_env_files(),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator("openai_api_key", mode="before")
    @classmethod
    def _normalize_openai_api_key(cls, value: object) -> str | None:
        if value is None or value is False:
            return None
        if value is True:
            raise ValueError(
                "OPENAI_API_KEY must be your API key string, not a boolean. "
                "Set OPENAI_API_KEY=sk-... in the repo .env or apps/api/.env"
            )
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return str(value)

    @field_validator("openai_transcription_model")
    @classmethod
    def _validate_transcription_model(cls, value: str) -> str:
        if value not in SUPPORTED_TRANSCRIPTION_MODELS:
            raise ValueError(
                f"Unsupported transcription model '{value}'. "
                f"Supported: {sorted(SUPPORTED_TRANSCRIPTION_MODELS)}"
            )
        return value

    @property
    def allowed_origins(self) -> list[str]:
        origins = [
            origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()
        ]
        if "*" in origins:
            raise ValueError(
                "CORS_ALLOWED_ORIGINS must list explicit origins; '*' is not allowed"
            )
        return origins

    @property
    def openai_configured(self) -> bool:
        return bool(self.openai_api_key) and bool(self.openai_model.strip())

    @property
    def transcription_enabled(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def effective_demo_mode(self) -> bool:
        return is_demo_mode()

    @property
    def ai_analysis_enabled(self) -> bool:
        return self.openai_configured and not is_demo_mode()


@lru_cache
def get_settings() -> Settings:
    return Settings()


def is_demo_mode() -> bool:
    if _demo_mode_override is not None:
        return _demo_mode_override
    return get_settings().flowwright_demo_mode


def reset_demo_mode_override() -> None:
    """Test helper: clear the in-memory override."""
    global _demo_mode_override
    _demo_mode_override = None


def capability_status() -> dict[str, Any]:
    settings = get_settings()
    demo = is_demo_mode()
    return {
        "demo_mode": demo,
        "openai_configured": settings.openai_configured,
        "transcription_enabled": settings.transcription_enabled,
        "ai_analysis_enabled": settings.openai_configured and not demo,
        "can_disable_demo_mode": settings.openai_configured,
        "openai_model_configured": bool(settings.openai_model.strip()),
    }


def _persist_demo_mode(enabled: bool) -> bool:
    """Update FLOWWRIGHT_DEMO_MODE in the nearest existing .env file."""
    # Prefer the process cwd so tests and local runs write where expected,
    # then apps/api/.env, then the repo-root .env.
    ordered = (Path(".env"), _API_ROOT / ".env", _REPO_ROOT / ".env")
    seen: set[Path] = set()
    path: Path | None = None
    for candidate in ordered:
        resolved = candidate.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        if resolved.is_file():
            path = resolved
            break
    if path is None:
        return False
    line = f"FLOWWRIGHT_DEMO_MODE={'true' if enabled else 'false'}"
    text = path.read_text(encoding="utf-8")
    pattern = re.compile(r"(?im)^FLOWWRIGHT_DEMO_MODE=.*$")
    if pattern.search(text):
        updated = pattern.sub(line, text)
    else:
        updated = text.rstrip() + "\n" + line + "\n"
    path.write_text(updated, encoding="utf-8")
    return True


def set_demo_mode(enabled: bool) -> dict[str, Any]:
    """Flip demo mode at runtime. Disabling requires OpenAI key + model."""
    global _demo_mode_override
    settings = get_settings()
    if not enabled and not settings.openai_configured:
        raise ValueError(
            "Cannot disable demo mode without OPENAI_API_KEY and OPENAI_MODEL "
            "configured in the repo .env or apps/api/.env"
        )
    _demo_mode_override = enabled
    persisted = _persist_demo_mode(enabled)
    status = capability_status()
    status["persisted_to_env"] = persisted
    return status
