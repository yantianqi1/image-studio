from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from apps.api.app.domains.auth.models import User
from apps.api.app.domains.auth.service import create_admin_account, create_user
from apps.api.app.infra.db.session import session_scope
from apps.api.app.main import create_app

ADMIN_USERNAME = "root"
ADMIN_PASSWORD = "admin-pass"
QUERY_PAGE = 1
QUERY_PAGE_SIZE = 2
MAX_PAGE_SIZE = 100


def seed_admin_and_users() -> None:
    with session_scope() as session:
        create_admin_account(session=session, username=ADMIN_USERNAME, password=ADMIN_PASSWORD)
        first = create_user(session=session, email="alice@example.com", password="top-secret")
        first.display_name = "Alice Account"
        second = create_user(session=session, email="bob@example.com", password="top-secret")
        second.display_name = "Bobby Tables"
        second.status = "suspended"
        third = create_user(session=session, email="carol@example.com", password="top-secret")
        third.display_name = "Carol Record"


def seed_admin() -> None:
    with session_scope() as session:
        create_admin_account(session=session, username=ADMIN_USERNAME, password=ADMIN_PASSWORD)


def login_admin(client: TestClient, *, username: str = ADMIN_USERNAME, password: str = ADMIN_PASSWORD) -> None:
    response = client.post(
        "/api/admin/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200


def test_admin_users_requires_session(client: TestClient) -> None:
    response = client.get("/api/admin/users")

    assert response.status_code == 401
    assert response.json() == {"error": "Unauthorized"}


def test_admin_users_returns_paginated_items(client: TestClient) -> None:
    seed_admin_and_users()
    login_admin(client)

    response = client.get("/api/admin/users", params={"page": QUERY_PAGE, "page_size": QUERY_PAGE_SIZE})
    payload = response.json()["data"]

    assert response.status_code == 200
    assert payload["page"] == QUERY_PAGE
    assert payload["page_size"] == QUERY_PAGE_SIZE
    assert payload["total"] == 3
    assert len(payload["items"]) == QUERY_PAGE_SIZE
    assert {"id", "email", "display_name", "status", "created_at"} <= payload["items"][0].keys()
    assert isinstance(payload["items"][0]["created_at"], str)


def test_admin_users_filters_by_query_and_status(client: TestClient) -> None:
    seed_admin_and_users()
    login_admin(client)

    query_response = client.get("/api/admin/users", params={"q": "Bobby"})
    status_response = client.get("/api/admin/users", params={"status": "suspended"})

    assert query_response.status_code == 200
    assert query_response.json()["data"]["total"] == 1
    assert query_response.json()["data"]["items"][0]["email"] == "bob@example.com"
    assert status_response.status_code == 200
    assert status_response.json()["data"]["total"] == 1
    assert status_response.json()["data"]["items"][0]["status"] == "suspended"


@pytest.mark.parametrize(
    ("params",),
    [
        ({"page": 0},),
        ({"page_size": MAX_PAGE_SIZE + 1},),
    ],
)
def test_admin_users_rejects_invalid_pagination(client: TestClient, params: dict[str, int]) -> None:
    seed_admin_and_users()
    login_admin(client)

    response = client.get("/api/admin/users", params=params)

    assert response.status_code == 422


def test_admin_can_update_user_status_with_reason(client: TestClient) -> None:
    seed_admin_and_users()
    login_admin(client)
    user_id = find_user_id("alice@example.com")

    disabled_response = client.patch(
        f"/api/admin/users/{user_id}/status",
        json={"status": "disabled", "reason": "terms violation"},
    )
    restored_response = client.patch(
        f"/api/admin/users/{user_id}/status",
        json={"status": "active", "reason": "appeal accepted"},
    )
    deleted_response = client.patch(
        f"/api/admin/users/{user_id}/status",
        json={"status": "deleted", "reason": "user requested removal"},
    )
    list_response = client.get("/api/admin/users", params={"status": "deleted"})

    assert disabled_response.status_code == 200
    assert disabled_response.json()["data"]["status"] == "disabled"
    assert restored_response.status_code == 200
    assert restored_response.json()["data"]["status"] == "active"
    assert deleted_response.status_code == 200
    assert deleted_response.json()["data"]["status"] == "deleted"
    assert list_response.json()["data"]["items"][0]["id"] == user_id


@pytest.mark.parametrize("reason", ["", "   "])
def test_admin_user_status_update_requires_reason(client: TestClient, reason: str) -> None:
    seed_admin_and_users()
    login_admin(client)
    user_id = find_user_id("alice@example.com")

    response = client.patch(
        f"/api/admin/users/{user_id}/status",
        json={"status": "disabled", "reason": reason},
    )

    assert response.status_code == 422


@pytest.mark.parametrize("status", ["disabled", "deleted"])
def test_admin_cannot_disable_or_delete_current_admin_user(client: TestClient, status: str) -> None:
    admin_email = "self-admin@example.com"
    with session_scope() as session:
        create_admin_account(session=session, username=admin_email, password="top-secret")
        create_user(session=session, email=admin_email, password="top-secret")
    login_admin(client, username=admin_email, password="top-secret")
    user_id = find_user_id(admin_email)

    response = client.patch(
        f"/api/admin/users/{user_id}/status",
        json={"status": status, "reason": "self protection"},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "self_status_update_forbidden"
    assert find_user_status("self-admin@example.com") == "active"


def test_inactive_user_cannot_login_or_use_existing_session(client: TestClient) -> None:
    register_response = client.post(
        "/api/public/auth/register",
        json={"email": "blocked@example.com", "password": "top-secret"},
    )
    seed_admin_and_users()
    admin_client = TestClient(create_app())
    login_admin(admin_client)
    user_id = register_response.json()["data"]["id"]

    update_response = admin_client.patch(
        f"/api/admin/users/{user_id}/status",
        json={"status": "disabled", "reason": "risk review"},
    )
    existing_session_response = client.get("/api/public/auth/me")
    login_response = client.post(
        "/api/public/auth/login",
        json={"email": "blocked@example.com", "password": "top-secret"},
    )

    assert update_response.status_code == 200
    assert existing_session_response.status_code == 403
    assert existing_session_response.json()["error"]["code"] == "user_not_active"
    assert login_response.status_code == 403
    assert login_response.json()["error"]["code"] == "user_not_active"


def find_user_id(email: str) -> int:
    with session_scope() as session:
        user = session.execute(select(User).where(User.email == email)).scalar_one()
        return user.id


def find_user_status(email: str) -> str:
    with session_scope() as session:
        user = session.execute(select(User).where(User.email == email)).scalar_one()
        return user.status
