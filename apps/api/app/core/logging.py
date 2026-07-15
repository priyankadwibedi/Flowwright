import logging
from logging.config import dictConfig


def configure_logging(level: str) -> None:
    """Configure logs without recording request bodies or secrets."""

    dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {"default": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"}},
            "handlers": {"default": {"class": "logging.StreamHandler", "formatter": "default"}},
            "root": {"handlers": ["default"], "level": level.upper()},
        }
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
