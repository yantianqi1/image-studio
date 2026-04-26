from __future__ import annotations

from pathlib import Path

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


def register_user(client: TestClient, *, email: str = "upload@example.com") -> None:
    response = client.post("/api/public/auth/register", json={"email": email, "password": "top-secret"})
    assert response.status_code == 201


def update_uploads_enabled(client: TestClient, *, enabled: bool) -> None:
    response = client.patch(
        "/api/admin/settings",
        json={
            "site_title": "image Studio",
            "allow_public_signup": True,
            "allow_anonymous_image": True,
            "uploads_enabled": enabled,
        },
    )
    assert response.status_code == 200


def test_upload_endpoint_rejects_when_uploads_disabled():
    client = build_client()
    register_user(client)
    seed_admin()
    admin_login(client)
    update_uploads_enabled(client, enabled=False)

    response = client.post(
        "/api/public/image/uploads",
        files={"file": ("demo.txt", b"demo-content", "text/plain")},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "uploads_disabled"


def test_upload_endpoint_persists_asset_when_enabled():
    client = build_client()
    register_user(client, email="upload-enabled@example.com")
    seed_admin()
    admin_login(client)
    update_uploads_enabled(client, enabled=True)

    response = client.post(
        "/api/public/image/uploads",
        files={"file": ("demo.txt", b"demo-content", "text/plain")},
    )

    assert response.status_code == 201
    asset = response.json()["data"]
    assert asset["mime_type"] == "text/plain"
    assert asset["asset_url"].startswith("/api/public/image/assets/")
    assert Path(asset["storage_path"]).exists()
