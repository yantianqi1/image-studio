from fastapi.testclient import TestClient

from apps.api.app.main import app


def test_health_returns_standard_response():
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "data": {
            "environment": "test",
            "service": "api",
            "status": "ok",
            "version": "0.1.0",
        },
        "error": None,
        "meta": {},
    }


def test_ready_returns_standard_response():
    response = TestClient(app).get("/ready")

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "ok"
    assert response.json()["error"] is None
