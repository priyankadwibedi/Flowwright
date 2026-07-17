import os

# Raise limits before the app/settings cache is used by tests.
os.environ["RATE_LIMIT_REQUESTS"] = "1000"
os.environ["ANONYMOUS_DAILY_QUOTA"] = "10000"
os.environ.setdefault("FLOWWRIGHT_DEMO_MODE", "true")

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings, reset_demo_mode_override
from app.main import app

get_settings.cache_clear()
reset_demo_mode_override()


@pytest.fixture()
def client() -> TestClient:
    reset_demo_mode_override()
    return TestClient(app)
