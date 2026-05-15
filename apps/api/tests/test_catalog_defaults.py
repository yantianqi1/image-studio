from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from apps.api.app.core.config import get_settings
from apps.api.app.domains.auth.service import create_admin_account
from apps.api.app.domains.llm.catalog import DEFAULT_MODEL_CODE
from apps.api.app.domains.llm.models import SellableModel
from apps.api.app.domains.llm.service import extract_image_reference
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


def test_default_catalog_uses_env_configured_openai_provider(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_PROVIDER_NAME", "wdapi")
    monkeypatch.setenv("OPENAI_PROVIDER_BASE_URL", "https://ws.wdapi.top/v1")
    monkeypatch.setenv("OPENAI_PROVIDER_API_KEY_ENV", "OPENAI_PROVIDER_KEY")
    monkeypatch.setenv("OPENAI_PROVIDER_DEFAULT_MODEL", "gemini-3-flash-preview-low-search")
    monkeypatch.setenv("OPENAI_CHAT_MODEL_CODE", "gemini-3-flash-preview-low-search")
    monkeypatch.setenv("OPENAI_CHAT_MODEL_DISPLAY_NAME", "Gemini 3 Flash Preview Low Search")
    monkeypatch.setenv("OPENAI_CHAT_MODEL_PROVIDER_MODEL", "gemini-3-flash-preview-low-search")
    monkeypatch.setenv("OPENAI_CHAT_MODEL_MEMBER_PRICE_CENTS", "12")
    monkeypatch.setenv("OPENAI_IMAGE_MODEL_CODE", "gpt-image-2")
    monkeypatch.setenv("OPENAI_IMAGE_MODEL_DISPLAY_NAME", "GPT Image 2")
    monkeypatch.setenv("OPENAI_IMAGE_MODEL_PROVIDER_MODEL", "gpt-image-2")
    monkeypatch.setenv("OPENAI_IMAGE_MODEL_MEMBER_PRICE_CENTS", "77")
    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")

    client = build_client()
    seed_admin()
    admin_login(client)

    providers_response = client.get("/api/admin/providers")
    models_response = client.get("/api/admin/models")

    assert providers_response.status_code == 200
    assert any(item["name"] == "wdapi" for item in providers_response.json()["data"])
    assert any(
        item["default_model"] == "gemini-3-flash-preview-low-search"
        for item in providers_response.json()["data"]
    )
    assert any(
        item["code"] == "gemini-3-flash-preview-low-search" and item["member_price_cents"] == 12
        for item in models_response.json()["data"]
    )
    assert any(
        item["code"] == "gpt-image-2" and item["member_price_cents"] == 77
        for item in models_response.json()["data"]
    )


def test_public_models_include_local_dev_image_for_local_development() -> None:
    client = build_client()

    response = client.get("/api/public/models")

    assert response.status_code == 200
    model_codes = [item["code"] for item in response.json()["data"]]
    assert model_codes[0] == DEFAULT_MODEL_CODE
    assert "gemini-3-flash-preview-low-search" not in model_codes
    assert "gpt-image-2" in model_codes
    assert "gpt-image-2-official" in model_codes


def test_public_models_include_channel_variant_prices() -> None:
    client = build_client()

    response = client.get("/api/public/models")

    assert response.status_code == 200
    models = response.json()["data"]
    lowcost = next(item for item in models if item["code"] == "gpt-image-2")
    official = next(item for item in models if item["code"] == "gpt-image-2-official")
    lowcost_medium = find_variant(lowcost, size="1024x1024", quality="medium")
    official_medium = find_variant(official, size="1024x1024", quality="medium")

    assert lowcost_medium["member_price_cents"] == 40
    assert official_medium["member_price_cents"] == 130
    assert {variant["size"] for variant in official["variants"]} == {
        "1024x1024",
        "1024x1536",
        "1536x1024",
    }


def test_admin_variant_update_survives_catalog_seed_refresh() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    models_response = client.get("/api/admin/models")
    official = next(item for item in models_response.json()["data"] if item["code"] == "gpt-image-2-official")
    variants_response = client.get(f"/api/admin/models/{official['id']}/variants")
    variant = find_variant(
        {"variants": variants_response.json()["data"]},
        size="1024x1024",
        quality="low",
    )

    update_response = client.put(
        f"/api/admin/models/{official['id']}/variants/{variant['id']}",
        json={
            "member_price_cents": 222,
            "anonymous_price_cents": 0,
            "status": "active",
        },
    )
    refresh_response = client.get("/api/public/models")
    variants_after_refresh = client.get(f"/api/admin/models/{official['id']}/variants")
    updated = find_variant(
        {"variants": variants_after_refresh.json()["data"]},
        size="1024x1024",
        quality="low",
    )

    assert update_response.status_code == 200
    assert refresh_response.status_code == 200
    assert updated["member_price_cents"] == 222
    assert updated["price_manually_set"] is True


def test_public_models_prioritize_local_dev_image_after_restore() -> None:
    client = build_client()
    client.get("/api/public/models")
    with session_scope() as session:
        local_model = session.execute(
            select(SellableModel).where(SellableModel.code == DEFAULT_MODEL_CODE)
        ).scalar_one()
        local_model.id = 999
        session.flush()

    response = client.get("/api/public/models")

    assert response.status_code == 200
    model_codes = [item["code"] for item in response.json()["data"]]
    assert model_codes[0] == DEFAULT_MODEL_CODE


def test_production_public_models_exclude_local_dev_image(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    get_settings.cache_clear()
    client = build_client()

    response = client.get("/api/public/models")

    assert response.status_code == 200
    model_codes = [item["code"] for item in response.json()["data"]]
    assert "local-dev-image" not in model_codes
    assert "gpt-image-2" in model_codes


def test_extract_image_reference_accepts_markdown_image_url() -> None:
    payload = {
        "choices": [
            {
                "message": {
                    "content": "![image_1](https://image2.mom/generated-images/dog.png)",
                },
            }
        ]
    }

    reference = extract_image_reference(payload)

    assert reference.kind == "url"
    assert reference.value == "https://image2.mom/generated-images/dog.png"


def find_variant(model: dict[str, object], *, size: str, quality: str) -> dict[str, object]:
    variants = model["variants"]
    assert isinstance(variants, list)
    return next(
        item
        for item in variants
        if item["size"] == size and item["quality"] == quality
    )
