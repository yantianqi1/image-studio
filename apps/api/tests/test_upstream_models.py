from __future__ import annotations

from dataclasses import dataclass

from fastapi.testclient import TestClient

from apps.api.app.domains.auth.service import create_admin_account
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.main import create_app


def build_client() -> TestClient:
    initialize_database()
    return TestClient(create_app())


def seed_admin() -> None:
    with session_scope() as session:
        create_admin_account(session=session, username="root", password="admin-pass")


def admin_login(client: TestClient) -> None:
    response = client.post("/api/admin/auth/login", json={"username": "root", "password": "admin-pass"})
    assert response.status_code == 200


def create_openai_provider(client: TestClient) -> dict[str, object]:
    response = client.post(
        "/api/admin/providers",
        json={
            "name": "openai-main",
            "type": "openai-compatible",
            "base_url": "https://example.test/v1",
            "api_key_env": "OPENAI_PROVIDER_KEY",
            "default_model": "gpt-image-1",
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


@dataclass(frozen=True)
class FakeHttpResponse:
    status_code: int
    payload: dict[str, object]
    headers: dict[str, str]

    @property
    def text(self) -> str:
        return str(self.payload)

    def json(self) -> dict[str, object]:
        return self.payload


def test_admin_can_fetch_upstream_models(monkeypatch) -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    captured: dict[str, object] = {}

    def fake_get(url: str, *, headers: dict[str, str], timeout: float):
        captured["url"] = url
        captured["headers"] = headers
        captured["timeout"] = timeout
        return FakeHttpResponse(
            status_code=200,
            payload={"data": [{"id": "gpt-image-2", "object": "model"}, {"id": "gemini-3-flash"}]},
            headers={},
        )

    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    monkeypatch.setattr("apps.api.app.domains.llm.upstream_models.httpx.get", fake_get)

    response = client.post(
        "/api/admin/models/upstream",
        json={"url": "https://example.test/v1/models", "api_key_env": "OPENAI_PROVIDER_KEY"},
    )

    assert response.status_code == 200
    assert captured["url"] == "https://example.test/v1/models"
    assert captured["headers"]["Authorization"] == "Bearer sk-test"
    assert response.json()["data"] == [
        {"id": "gpt-image-2", "display_name": "gpt-image-2"},
        {"id": "gemini-3-flash", "display_name": "gemini-3-flash"},
    ]


def test_admin_can_import_upstream_model_into_catalog(monkeypatch) -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    provider = create_openai_provider(client)

    def fake_get(url: str, *, headers: dict[str, str], timeout: float):
        return FakeHttpResponse(
            status_code=200,
            payload={"data": [{"id": "gpt-image-2"}, {"id": "gpt-4.1-mini"}]},
            headers={},
        )

    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    monkeypatch.setattr("apps.api.app.domains.llm.upstream_models.httpx.get", fake_get)

    response = client.post(
        "/api/admin/models/import-upstream",
        json={
            "url": "https://example.test/v1/models",
            "api_key_env": "OPENAI_PROVIDER_KEY",
            "provider_id": provider["id"],
            "model_ids": ["gpt-image-2"],
            "capability": "image",
            "public_enabled": True,
        },
    )
    models_response = client.get("/api/admin/models")

    assert response.status_code == 201
    assert response.json()["data"][0]["code"] == "gpt-image-2"
    assert any(item["code"] == "gpt-image-2" for item in models_response.json()["data"])
