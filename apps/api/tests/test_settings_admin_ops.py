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


def register_user(client: TestClient, *, email: str = "settings@example.com") -> dict[str, object]:
    response = client.post("/api/public/auth/register", json={"email": email, "password": "top-secret"})
    assert response.status_code == 201
    return response.json()["data"]


def update_site_settings(
    client: TestClient,
    *,
    site_title: str = "image Studio",
    allow_public_signup: bool = True,
    allow_anonymous_image: bool = True,
    uploads_enabled: bool = True,
    client_provider_url_pool: str = "",
) -> None:
    response = client.patch(
        "/api/admin/settings",
        json={
            "site_title": site_title,
            "allow_public_signup": allow_public_signup,
            "allow_anonymous_image": allow_anonymous_image,
            "uploads_enabled": uploads_enabled,
            "client_provider_url_pool": client_provider_url_pool,
        },
    )
    assert response.status_code == 200


def test_disabling_public_signup_blocks_register() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    update_site_settings(client, allow_public_signup=False)

    response = client.post(
        "/api/public/auth/register",
        json={"email": "blocked@example.com", "password": "top-secret"},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "public_signup_disabled"


def test_disabling_anonymous_image_blocks_anonymous_job_creation() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    update_site_settings(client, allow_anonymous_image=False)

    response = client.post(
        "/api/public/image/jobs",
        json={"prompt": "Anonymous request", "model_code": "gpt-image-2", "requested_count": 1},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "anonymous_image_disabled"


def test_disabling_uploads_blocks_edit_mode_job_creation() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    register_user(client, email="edit@example.com")
    update_site_settings(client, uploads_enabled=False)

    response = client.post(
        "/api/public/image/jobs",
        json={"prompt": "Edit request", "model_code": "gpt-image-2", "requested_count": 1, "mode": "edit"},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "uploads_disabled"


def test_admin_can_read_wallet_and_ledger() -> None:
    client = build_client()
    user = register_user(client, email="ledger@example.com")
    reserve_response = client.post(
        "/api/public/billing/wallets/me/reservations",
        json={"amount_cents": 30, "reason": "image-job"},
    )
    reservation_id = reserve_response.json()["data"]["reservation_id"]
    client.post(f"/api/public/billing/wallets/me/reservations/{reservation_id}/commit")
    seed_admin()
    admin_login(client)

    wallet_response = client.get(f"/api/admin/billing/wallets/{user['id']}")
    ledger_response = client.get(f"/api/admin/billing/wallets/{user['id']}/ledger")

    assert wallet_response.status_code == 200
    assert wallet_response.json()["data"]["balance_cents"] == 70
    assert ledger_response.status_code == 200
    assert [item["reason"] for item in ledger_response.json()["data"]] == ["signup_bonus", "image-job"]


def test_admin_can_adjust_wallet_and_see_ledger() -> None:
    client = build_client()
    user = register_user(client, email="adjust@example.com")
    seed_admin()
    admin_login(client)

    adjust_response = client.post(
        f"/api/admin/billing/wallets/{user['id']}/adjustments",
        json={"amount_cents": 25, "reason": "manual_credit"},
    )
    wallet_response = client.get(f"/api/admin/billing/wallets/{user['id']}")
    ledger_response = client.get(f"/api/admin/billing/wallets/{user['id']}/ledger")

    assert adjust_response.status_code == 200
    assert wallet_response.json()["data"]["balance_cents"] == 125
    assert [item["reason"] for item in ledger_response.json()["data"]] == ["signup_bonus", "manual_credit"]


def test_public_settings_exposes_site_title() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    update_site_settings(client, site_title="Studio X")

    response = client.get("/api/public/settings")

    assert response.status_code == 200
    assert response.json()["data"]["site_title"] == "Studio X"


def test_admin_can_update_client_provider_url_pool() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)

    update_site_settings(
        client,
        client_provider_url_pool="https://first.example/v1\nhttps://second.example/v1",
    )
    response = client.get("/api/admin/settings")

    assert response.status_code == 200
    assert response.json()["data"]["client_provider_url_pool"] == (
        "https://first.example/v1\nhttps://second.example/v1"
    )
