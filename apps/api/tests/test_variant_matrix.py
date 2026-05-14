from __future__ import annotations

from fastapi.testclient import TestClient

from apps.api.app.domains.auth.service import create_admin_account
from apps.api.app.domains.llm.variant_matrix import ALL_SIZES, ALL_VARIANT_KEYS, QUALITY_OPTIONS
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


def create_provider_and_model(client: TestClient) -> int:
    client.post("/api/admin/providers", json={
        "name": "test-provider",
        "type": "openai-compatible",
        "base_url": "https://example.test/v1",
        "api_key_env": "TEST_KEY",
        "default_model": "test-model",
    })
    resp = client.post("/api/admin/models", json={
        "code": "test-image-model",
        "display_name": "Test Image",
        "capability": "image",
        "provider_id": 1,
        "provider_model": "test-model",
        "public_enabled": True,
        "member_price_cents": 10,
        "anonymous_price_cents": 20,
    })
    assert resp.status_code == 201
    return resp.json()["data"]["id"]


def test_all_sizes_constant_has_84_combinations():
    assert len(ALL_SIZES) == 28
    assert len(QUALITY_OPTIONS) == 3
    assert len(ALL_VARIANT_KEYS) == 84


def test_variant_matrix_endpoint_empty(client):
    seed_admin()
    admin_login(client)
    model_id = create_provider_and_model(client)

    resp = client.get(f"/api/admin/models/{model_id}/variant-matrix")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["model_id"] == model_id
    assert len(data["groups"]) == 7

    total_slots = 0
    for group in data["groups"]:
        for tier in group["tiers"]:
            for v in tier["variants"]:
                total_slots += 1
                assert v["id"] is None
                assert v["member_price_cents"] is None
    assert total_slots == 84


def test_variant_matrix_merges_existing(client):
    seed_admin()
    admin_login(client)
    model_id = create_provider_and_model(client)

    client.post(f"/api/admin/models/{model_id}/variants", json={
        "size": "1024x1024",
        "quality": "medium",
        "member_price_cents": 50,
        "anonymous_price_cents": 100,
    })

    resp = client.get(f"/api/admin/models/{model_id}/variant-matrix")
    data = resp.json()["data"]
    group_1_1 = next(g for g in data["groups"] if g["aspect_ratio"] == "1:1")
    tier_std = next(t for t in group_1_1["tiers"] if t["size"] == "1024x1024")
    medium_slot = next(v for v in tier_std["variants"] if v["quality"] == "medium")
    assert medium_slot["id"] is not None
    assert medium_slot["member_price_cents"] == 50
    assert medium_slot["anonymous_price_cents"] == 100


def test_batch_upsert_creates_new(client):
    seed_admin()
    admin_login(client)
    model_id = create_provider_and_model(client)

    resp = client.post(f"/api/admin/models/{model_id}/variants/batch", json={
        "variants": [
            {"size": "1024x1024", "quality": "low", "member_price_cents": 10, "anonymous_price_cents": 20, "status": "active"},
            {"size": "1024x1024", "quality": "medium", "member_price_cents": 25, "anonymous_price_cents": 50, "status": "active"},
        ]
    })
    assert resp.status_code == 200
    results = resp.json()["data"]
    assert len(results) == 2
    assert results[0]["size"] == "1024x1024"
    assert results[0]["quality"] == "low"
    assert results[0]["member_price_cents"] == 10


def test_batch_upsert_updates_existing(client):
    seed_admin()
    admin_login(client)
    model_id = create_provider_and_model(client)

    client.post(f"/api/admin/models/{model_id}/variants/batch", json={
        "variants": [
            {"size": "1920x1080", "quality": "high", "member_price_cents": 30, "anonymous_price_cents": 60, "status": "active"},
        ]
    })

    resp = client.post(f"/api/admin/models/{model_id}/variants/batch", json={
        "variants": [
            {"size": "1920x1080", "quality": "high", "member_price_cents": 99, "anonymous_price_cents": 199, "status": "disabled"},
        ]
    })
    assert resp.status_code == 200
    results = resp.json()["data"]
    assert results[0]["member_price_cents"] == 99
    assert results[0]["status"] == "disabled"


def test_batch_upsert_rejects_invalid_size(client):
    seed_admin()
    admin_login(client)
    model_id = create_provider_and_model(client)

    resp = client.post(f"/api/admin/models/{model_id}/variants/batch", json={
        "variants": [
            {"size": "9999x9999", "quality": "low", "member_price_cents": 10, "anonymous_price_cents": 20, "status": "active"},
        ]
    })
    assert resp.status_code == 422


def test_resolve_variant_strict_raises(client):
    from apps.api.app.core.errors import AppError
    from apps.api.app.domains.llm.service import resolve_variant

    seed_admin()
    admin_login(client)
    model_id = create_provider_and_model(client)

    with session_scope() as session:
        import pytest
        with pytest.raises(AppError) as exc_info:
            resolve_variant(session, model_id=model_id, size="1024x1024", quality="low")
        assert exc_info.value.code == "variant_not_found"


def test_resolve_variant_returns_none_when_no_size_quality(client):
    from apps.api.app.domains.llm.service import resolve_variant

    seed_admin()
    admin_login(client)
    model_id = create_provider_and_model(client)

    with session_scope() as session:
        result = resolve_variant(session, model_id=model_id, size=None, quality=None)
        assert result is None
        result = resolve_variant(session, model_id=model_id, size="1024x1024", quality=None)
        assert result is None
