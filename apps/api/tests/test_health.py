def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "flowwright-api", "version": "0.1.0"}


def test_api_root(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["health"] == "/health"
