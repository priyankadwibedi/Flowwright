from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables or a local .env file."""

    app_name: str = "flowwright-api"
    app_version: str = "0.1.0"
    flowwright_demo_mode: bool = True
    openai_api_key: str | None = None
    openai_model: str = ""
    openai_transcription_model: str = "gpt-4o-mini-transcribe"
    openai_timeout_seconds: float = Field(default=45.0, gt=0, le=300)
    openai_max_retries: int = Field(default=2, ge=0, le=5)
    cors_allowed_origins: str = "http://localhost:3000"
    max_upload_size_mb: int = Field(default=50, ge=1, le=500)
    max_keyframes: int = Field(default=8, ge=1, le=8)
    max_frame_width: int = Field(default=1280, ge=320, le=1920)
    jpeg_quality: int = Field(default=75, ge=50, le=95)
    database_url: str = "sqlite:///./flowwright.db"
    log_level: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore"
    )

    @property
    def allowed_origins(self) -> list[str]:
        origins = [
            origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()
        ]
        if "*" in origins:
            raise ValueError("CORS_ALLOWED_ORIGINS must list explicit origins; '*' is not allowed")
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
