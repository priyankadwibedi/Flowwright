from app.core.config import get_settings, reset_demo_mode_override


def _isolate_from_developer_env(monkeypatch) -> None:
    """Keep unit tests independent of the developer's real OpenAI .env."""
    monkeypatch.setenv("FLOWWRIGHT_DEMO_MODE", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("OPENAI_MODEL", "")
    get_settings.cache_clear()
    reset_demo_mode_override()


def test_health(client, monkeypatch):
    _isolate_from_developer_env(monkeypatch)
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "flowwright-api"
    assert payload["version"] == "0.1.0"
    assert payload["demo_mode"] is True
    assert payload["ai_analysis_enabled"] is False


def test_api_root(client, monkeypatch):
    _isolate_from_developer_env(monkeypatch)
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["health"] == "/health"
    assert "demo_mode" in response.json()


def test_settings_endpoint_reports_demo_mode(client, monkeypatch):
    _isolate_from_developer_env(monkeypatch)
    response = client.get("/api/v1/settings")
    assert response.status_code == 200
    assert response.json()["demo_mode"] is True
    assert response.json()["can_disable_demo_mode"] is False


def test_demo_mode_mutation_is_not_public(client, monkeypatch):
    _isolate_from_developer_env(monkeypatch)
    response = client.post("/api/v1/settings/demo-mode", json={"enabled": False})
    assert response.status_code == 404
    assert "deployment configuration" in response.json()["detail"]
