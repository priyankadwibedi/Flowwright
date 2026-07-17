from app.core.config import get_settings, reset_demo_mode_override, set_demo_mode


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


def test_cannot_disable_demo_mode_without_openai(client, monkeypatch):
    _isolate_from_developer_env(monkeypatch)
    response = client.post("/api/v1/settings/demo-mode", json={"enabled": False})
    assert response.status_code == 422
    assert "OPENAI_API_KEY" in response.json()["detail"]


def test_can_toggle_demo_mode_when_openai_configured(client, monkeypatch, tmp_path):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-4o")
    monkeypatch.setenv("FLOWWRIGHT_DEMO_MODE", "true")
    get_settings.cache_clear()
    reset_demo_mode_override()

    env_file = tmp_path / ".env"
    env_file.write_text("FLOWWRIGHT_DEMO_MODE=true\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)

    disabled = client.post("/api/v1/settings/demo-mode", json={"enabled": False})
    assert disabled.status_code == 200
    body = disabled.json()
    assert body["demo_mode"] is False
    assert body["ai_analysis_enabled"] is True
    assert body["persisted_to_env"] is True
    assert "FLOWWRIGHT_DEMO_MODE=false" in env_file.read_text(encoding="utf-8")

    enabled = client.post("/api/v1/settings/demo-mode", json={"enabled": True})
    assert enabled.status_code == 200
    assert enabled.json()["demo_mode"] is True
    assert enabled.json()["ai_analysis_enabled"] is False

    status = set_demo_mode(False)
    assert status["demo_mode"] is False
