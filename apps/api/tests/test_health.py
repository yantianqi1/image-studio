def test_health_returns_standard_response(client):
    response = client.get("/health")

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
def test_ready_returns_standard_response(client):
    response = client.get("/ready")

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "ok"
    assert response.json()["error"] is None
