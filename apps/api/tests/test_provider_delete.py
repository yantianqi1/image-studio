from __future__ import annotations

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
            "name": "openai-delete-test",
            "type": "openai-compatible",
            "base_url": "https://example.test/v1",
            "api_key_env": "OPENAI_PROVIDER_KEY",
            "default_model": "gpt-image-1",
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


def create_sellable_model(client: TestClient, *, provider_id: int) -> dict[str, object]:
    response = client.post(
        "/api/admin/models",
        json={
            "code": "delete-me-image",
            "display_name": "Delete Me Image",
            "capability": "image",
            "public_enabled": True,
            "member_price_cents": 55,
            "anonymous_price_cents": 99,
            "provider_id": provider_id,
            "provider_model": "gpt-image-1",
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


def test_admin_can_delete_sellable_model() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    provider = create_openai_provider(client)
    create_sellable_model(client, provider_id=provider["id"])

    response = client.delete("/api/admin/models/delete-me-image")
    models_response = client.get("/api/admin/models")

    assert response.status_code == 200
    assert response.json()["data"] == {"deleted": True}
    assert all(item["code"] != "delete-me-image" for item in models_response.json()["data"])


def test_admin_can_delete_sellable_model_with_slash_code() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    provider = create_openai_provider(client)
    response = client.post(
        "/api/admin/models",
        json={
            "code": "vendor/model-x",
            "display_name": "Vendor Model X",
            "capability": "chat",
            "public_enabled": False,
            "member_price_cents": 55,
            "anonymous_price_cents": 99,
            "provider_id": provider["id"],
            "provider_model": "vendor/model-x",
        },
    )
    assert response.status_code == 201

    delete_response = client.delete("/api/admin/models/vendor/model-x")
    models_response = client.get("/api/admin/models")

    assert delete_response.status_code == 200
    assert delete_response.json()["data"] == {"deleted": True}
    assert all(item["code"] != "vendor/model-x" for item in models_response.json()["data"])


def test_admin_can_delete_provider_without_models() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    provider = create_openai_provider(client)

    response = client.delete(f"/api/admin/providers/{provider['id']}")
    providers_response = client.get("/api/admin/providers")

    assert response.status_code == 200
    assert response.json()["data"] == {"deleted": True}
    assert all(item["id"] != provider["id"] for item in providers_response.json()["data"])


def test_admin_can_delete_provider_with_models() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    provider = create_openai_provider(client)
    create_sellable_model(client, provider_id=provider["id"])

    response = client.delete(f"/api/admin/providers/{provider['id']}")
    providers_response = client.get("/api/admin/providers")
    models_response = client.get("/api/admin/models")

    assert response.status_code == 200
    assert response.json()["data"] == {"deleted": True}
    assert all(item["id"] != provider["id"] for item in providers_response.json()["data"])
    assert all(item["provider_id"] != provider["id"] for item in models_response.json()["data"])


def test_deleted_seed_provider_is_not_recreated_by_admin_lists() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    providers_response = client.get("/api/admin/providers")
    provider = next(item for item in providers_response.json()["data"] if item["name"] == "local-dev")

    delete_response = client.delete(f"/api/admin/providers/{provider['id']}")
    providers_after_delete = client.get("/api/admin/providers")
    models_after_delete = client.get("/api/admin/models")

    assert delete_response.status_code == 200
    assert all(item["name"] != "local-dev" for item in providers_after_delete.json()["data"])
    assert all(item["code"] != "local-dev-image" for item in models_after_delete.json()["data"])


def test_admin_can_delete_default_local_dev_model_without_recreation() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)

    initial_models_response = client.get("/api/admin/models")
    assert any(item["code"] == "local-dev-image" for item in initial_models_response.json()["data"])

    delete_response = client.delete("/api/admin/models/local-dev-image")
    models_after_delete = client.get("/api/admin/models")

    assert delete_response.status_code == 200
    assert delete_response.json()["data"] == {"deleted": True}
    assert all(item["code"] != "local-dev-image" for item in models_after_delete.json()["data"])
