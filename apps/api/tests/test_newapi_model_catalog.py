from __future__ import annotations

from dataclasses import dataclass

from fastapi.testclient import TestClient

from apps.api.app.core.config import get_settings
from apps.api.app.domains.auth.service import create_admin_account
from apps.api.app.domains.llm.models import Provider, SellableModel
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.main import create_app


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


def build_client() -> TestClient:
    initialize_database()
    return TestClient(create_app())


def seed_admin() -> None:
    with session_scope() as session:
        create_admin_account(session=session, username="root", password="admin-pass")


def admin_login(client: TestClient) -> None:
    response = client.post("/api/admin/auth/login", json={"username": "root", "password": "admin-pass"})
    assert response.status_code == 200


def test_admin_can_sync_newapi_models_without_prices(monkeypatch) -> None:
    monkeypatch.setenv("NEWAPI_BASE_URL", "https://newapi.example/v1")
    monkeypatch.setenv("NEWAPI_API_KEY_ENV", "NEWAPI_KEY")
    monkeypatch.setenv("NEWAPI_KEY", "sk-newapi")
    get_settings.cache_clear()
    captured: dict[str, object] = {}

    def fake_get(url: str, *, headers: dict[str, str], timeout: float):
        captured.update({"url": url, "headers": headers, "timeout": timeout})
        return FakeHttpResponse(
            status_code=200,
            payload={"data": [{"id": "gpt-image-2"}, {"id": "gemini-3-pro-image-preview"}]},
            headers={},
        )

    monkeypatch.setattr("apps.api.app.domains.llm.upstream_models.httpx.get", fake_get)
    client = build_client()
    seed_admin()
    admin_login(client)

    response = client.post("/api/admin/models/sync-newapi")

    assert response.status_code == 200
    assert captured["url"] == "https://newapi.example/v1/models"
    assert captured["headers"]["Authorization"] == "Bearer sk-newapi"
    synced = response.json()["data"]
    assert [item["code"] for item in synced] == ["gpt-image-2", "gemini-3-pro-image-preview"]
    assert all(item["provider_model"] == item["code"] for item in synced)
    assert all(item["capability"] == "image" for item in synced)
    assert all(item["public_enabled"] is False for item in synced)
    assert all_model_payloads_are_unpriced(synced)

    with session_scope() as session:
        provider = session.query(Provider).filter(Provider.name == "newapi").one()
        models = session.query(SellableModel).filter(SellableModel.provider_id == provider.id).all()

    assert provider.base_url == "https://newapi.example/v1"
    assert provider.api_key_env == "NEWAPI_KEY"
    assert {model.provider_model for model in models} == {"gpt-image-2", "gemini-3-pro-image-preview"}


def test_public_and_admin_model_catalog_payloads_are_unpriced() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)

    admin_response = client.get("/api/admin/models")
    public_response = client.get("/api/public/models")

    assert admin_response.status_code == 200
    assert public_response.status_code == 200
    assert admin_response.json()["data"]
    assert public_response.json()["data"]
    assert all_model_payloads_are_unpriced(admin_response.json()["data"])
    assert all_model_payloads_are_unpriced(public_response.json()["data"])


def all_model_payloads_are_unpriced(models: list[dict[str, object]]) -> bool:
    return all(
        "member_price_cents" not in model
        and "member_price_credits" not in model
        and "anonymous_price_cents" not in model
        and "variants" not in model
        for model in models
    )
