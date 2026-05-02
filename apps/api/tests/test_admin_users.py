from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from apps.api.app.domains.auth.service import create_admin_account, create_user
from apps.api.app.infra.db.session import session_scope

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


def login_admin(client: TestClient) -> None:
    response = client.post(
        "/api/admin/auth/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
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
