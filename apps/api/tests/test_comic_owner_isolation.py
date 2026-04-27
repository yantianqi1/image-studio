from __future__ import annotations

from fastapi.testclient import TestClient

from apps.api.app.domains.auth.service import create_admin_account
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.main import create_app


def build_client() -> TestClient:
    initialize_database()
    return TestClient(create_app())


def new_client() -> TestClient:
    return TestClient(create_app())


def register_user(client: TestClient, email: str) -> None:
    response = client.post("/api/public/auth/register", json={"email": email, "password": "top-secret"})
    assert response.status_code == 201


def create_project(client: TestClient, title: str = "Private Comic") -> dict:
    response = client.post(
        "/api/public/comic/projects",
        json={"title": title, "description": "owner scoped", "genre": "Drama"},
    )
    assert response.status_code == 201
    return response.json()["data"]


def create_task(client: TestClient, project_id: str) -> dict:
    response = client.post(
        "/api/public/comic/tasks",
        json={
            "project_id": project_id,
            "task_type": "import",
            "input_payload": {"style_preset": "ink_wash", "source_text": "private story"},
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


def seed_admin() -> None:
    with session_scope() as session:
        create_admin_account(session=session, username="root", password="admin-pass")


def login_admin(client: TestClient) -> None:
    response = client.post("/api/admin/auth/login", json={"username": "root", "password": "admin-pass"})
    assert response.status_code == 200


def test_login_users_cannot_read_or_delete_each_others_comic_data():
    alice = build_client()
    register_user(alice, "alice-comic@example.com")
    project = create_project(alice)
    task = create_task(alice, project["id"])

    bob = new_client()
    register_user(bob, "bob-comic@example.com")

    assert bob.get("/api/public/comic/projects").json()["data"] == []
    assert bob.get(f"/api/public/comic/projects/{project['id']}").status_code == 404
    assert bob.get(f"/api/public/comic/tasks/{task['id']}").status_code == 404
    assert bob.delete(f"/api/public/comic/tasks/{task['id']}").status_code == 404
    assert bob.delete(f"/api/public/comic/projects/{project['id']}").status_code == 404


def test_anonymous_browsers_cannot_read_each_others_comic_data():
    anonymous_a = build_client()
    assert anonymous_a.post("/api/public/auth/anonymous-session").status_code == 201
    project = create_project(anonymous_a, title="Anonymous A")

    anonymous_b = new_client()
    assert anonymous_b.post("/api/public/auth/anonymous-session").status_code == 201

    assert anonymous_b.get("/api/public/comic/projects").json()["data"] == []
    assert anonymous_b.get(f"/api/public/comic/projects/{project['id']}").status_code == 404


def test_admin_can_still_list_all_comic_tasks():
    user = build_client()
    register_user(user, "admin-visible-comic@example.com")
    project = create_project(user, title="Admin Visible")
    task = create_task(user, project["id"])
    seed_admin()

    admin = new_client()
    login_admin(admin)
    response = admin.get("/api/admin/comic/tasks")

    assert response.status_code == 200
    assert task["id"] in {item["id"] for item in response.json()["data"]}
