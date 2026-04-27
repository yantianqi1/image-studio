from __future__ import annotations

from dataclasses import dataclass

from fastapi.testclient import TestClient
from sqlalchemy import text

from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.main import create_app

COOKIE_NAME = "studio_anonymous_session"
PASSWORD = "top-secret"


@dataclass(frozen=True)
class AnonymousWorkspace:
    token: str
    session_id: int
    project_id: str
    task_id: str
    asset_id: int
    asset_url: str
    job_id: int


def build_client() -> TestClient:
    initialize_database()
    return TestClient(create_app())


def create_anonymous_workspace(client: TestClient) -> AnonymousWorkspace:
    anonymous_response = client.post("/api/public/auth/anonymous-session")
    project = create_project(client)
    task = create_task(client, project["id"])
    asset = upload_asset(client)
    job = create_image_job(client)
    return AnonymousWorkspace(
        token=anonymous_response.cookies[COOKIE_NAME],
        session_id=anonymous_response.json()["data"]["anonymous_session_id"],
        project_id=project["id"],
        task_id=task["id"],
        asset_id=asset["id"],
        asset_url=asset["asset_url"],
        job_id=job["id"],
    )


def create_project(client: TestClient) -> dict:
    response = client.post(
        "/api/public/comic/projects",
        json={"title": "Anonymous Comic", "description": "upgrade me", "genre": "Drama"},
    )
    assert response.status_code == 201
    return response.json()["data"]


def create_task(client: TestClient, project_id: str) -> dict:
    response = client.post(
        "/api/public/comic/tasks",
        json={
            "project_id": project_id,
            "task_type": "import",
            "input_payload": {"style_preset": "ink_wash", "source_text": "anonymous story"},
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


def upload_asset(client: TestClient) -> dict:
    response = client.post(
        "/api/public/image/uploads",
        files={"file": ("anonymous.png", b"anonymous-image", "image/png")},
    )
    assert response.status_code == 201
    return response.json()["data"]


def create_image_job(client: TestClient) -> dict:
    response = client.post(
        "/api/public/image/jobs",
        json={"prompt": "anonymous image", "model_code": "gpt-image-2", "requested_count": 1},
    )
    assert response.status_code == 201
    return response.json()["data"]


def register_user(client: TestClient, email: str) -> dict:
    response = client.post("/api/public/auth/register", json={"email": email, "password": PASSWORD})
    assert response.status_code == 201
    return response.json()["data"]


def login_user(client: TestClient, email: str) -> dict:
    response = client.post("/api/public/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200
    return response.json()["data"]


def assert_logged_in_owner_can_access(client: TestClient, workspace: AnonymousWorkspace) -> None:
    assert client.get(f"/api/public/comic/projects/{workspace.project_id}").status_code == 200
    assert client.get(f"/api/public/comic/tasks/{workspace.task_id}").status_code == 200
    assert client.get(f"/api/public/image/jobs/{workspace.job_id}").status_code == 200
    assert client.get(workspace.asset_url).status_code == 200


def assert_old_anonymous_owner_cannot_access(workspace: AnonymousWorkspace) -> None:
    old_client = build_client()
    headers = {"cookie": f"{COOKIE_NAME}={workspace.token}"}
    assert old_client.get(f"/api/public/comic/projects/{workspace.project_id}", headers=headers).status_code == 404
    assert old_client.get(f"/api/public/comic/tasks/{workspace.task_id}", headers=headers).status_code == 404
    assert old_client.get(f"/api/public/image/jobs/{workspace.job_id}", headers=headers).status_code == 404
    assert old_client.get(workspace.asset_url, headers=headers).status_code == 404


def assert_database_owner_migrated(workspace: AnonymousWorkspace, user_id: int) -> None:
    with session_scope() as session:
        rows = {
            "project": owner_row(session, "comic_projects", "owner_user_id", "owner_anonymous_session_id", workspace.project_id),
            "task": owner_row(session, "comic_tasks", "user_id", "anonymous_session_id", workspace.task_id),
            "asset": owner_row(session, "assets", "owner_user_id", "owner_anonymous_session_id", workspace.asset_id),
            "job": owner_row(session, "image_jobs", "user_id", "anonymous_session_id", workspace.job_id),
        }
        revoked_at = session.execute(
            text("select revoked_at from anonymous_sessions where id = :id"),
            {"id": workspace.session_id},
        ).scalar_one()

    assert set(rows.values()) == {(user_id, None)}
    assert revoked_at is not None


def owner_row(session, table: str, user_column: str, anonymous_column: str, row_id: int | str) -> tuple[int | None, int | None]:
    return session.execute(
        text(f"select {user_column}, {anonymous_column} from {table} where id = :id"),
        {"id": row_id},
    ).one()


def test_register_claims_anonymous_comic_and_image_data() -> None:
    client = build_client()
    workspace = create_anonymous_workspace(client)

    user = register_user(client, "register-upgrade@example.com")

    assert_logged_in_owner_can_access(client, workspace)
    assert_database_owner_migrated(workspace, user["id"])
    assert_old_anonymous_owner_cannot_access(workspace)


def test_login_claims_anonymous_comic_and_image_data() -> None:
    account_client = build_client()
    user = register_user(account_client, "login-upgrade@example.com")
    anonymous_client = build_client()
    workspace = create_anonymous_workspace(anonymous_client)

    login_user(anonymous_client, "login-upgrade@example.com")

    assert_logged_in_owner_can_access(anonymous_client, workspace)
    assert_database_owner_migrated(workspace, user["id"])
    assert_old_anonymous_owner_cannot_access(workspace)
