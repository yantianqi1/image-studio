from __future__ import annotations

from fastapi.testclient import TestClient

from apps.api.app.domains.billing.service import get_wallet
from apps.api.app.domains.comic.models import ComicTask
from apps.api.app.domains.image.models import ImageJob
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.main import create_app


def test_registered_user_image_job_keeps_client_provider_config() -> None:
    client = build_client()
    user = register_user(client, email="member-provider@example.com")

    response = client.post(
        "/api/public/image/jobs",
        headers=client_provider_headers(client_id="member-image-client"),
        json={"prompt": "Member client render", "model_code": "gpt-image-2", "requested_count": 1},
    )

    assert response.status_code == 201
    job = response.json()["data"]
    assert job["source"] == "client_provider"
    assert job["charge_cents"] == 0
    with session_scope() as session:
        stored_job = session.get(ImageJob, job["id"])
        wallet = get_wallet(session, user_id=user["id"])
        assert stored_job is not None
        assert stored_job.user_id == user["id"]
        assert stored_job.client_access_id == "member-image-client"
        assert stored_job.client_provider_config["base_url"] == "https://client.example/v1"
        assert stored_job.client_provider_config["api_key"] == "sk-client-provider"
        assert wallet.locked_cents == 0


def test_registered_user_comic_task_keeps_client_provider_config() -> None:
    client = build_client()
    user = register_user(client, email="member-comic-provider@example.com")

    task = create_comic_task(client)

    with session_scope() as session:
        stored_task = session.get(ComicTask, task["id"])
        assert stored_task is not None
        assert stored_task.user_id == user["id"]
        assert stored_task.client_access_id == "comic-client"
        assert stored_task.client_provider_config["base_url"] == "https://client.example/v1"
        assert stored_task.client_provider_config["api_key"] == "sk-client-provider"


def build_client() -> TestClient:
    initialize_database()
    return TestClient(create_app())


def register_user(client: TestClient, *, email: str) -> dict:
    response = client.post("/api/public/auth/register", json={"email": email, "password": "top-secret"})
    assert response.status_code == 201
    return response.json()["data"]


def create_comic_task(client: TestClient) -> dict:
    project_id = create_comic_project(client)
    client.put(
        f"/api/public/comic/projects/{project_id}/chapters/chapter-001",
        json={"title": "Crossing", "summary": "River crossing", "sequence": 1},
    )
    client.put(
        f"/api/public/comic/projects/{project_id}/chapters/chapter-001/scenes/scene-001",
        json={"title": "Ferry", "summary": "Ferry scene", "sequence": 1, "shots": ["wide"]},
    )
    response = client.post(
        "/api/public/comic/tasks",
        headers=client_provider_headers(client_id="comic-client"),
        json={
            "project_id": project_id,
            "chapter_id": "chapter-001",
            "scene_id": "scene-001",
            "task_type": "scene-render",
            "input_payload": {"source_type": "text", "source_text": "Lin reaches a haunted ferry."},
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


def create_comic_project(client: TestClient) -> str:
    response = client.post(
        "/api/public/comic/projects",
        json={"title": "River Blade", "description": "Fixture", "genre": "Wuxia"},
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


def client_provider_headers(*, client_id: str) -> dict[str, str]:
    return {
        "x-client-id": client_id,
        "x-client-provider-base-url": "https://client.example/v1",
        "x-client-provider-api-key": "sk-client-provider",
    }
