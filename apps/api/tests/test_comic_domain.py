from __future__ import annotations

from fastapi import APIRouter, FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from sqlalchemy import select

from apps.api.app.core.errors import AppError
from apps.api.app.core.response import api_error
from apps.api.app.domains.comic.router import public_router
from apps.api.app.infra.db.session import initialize_database


def create_comic_client() -> TestClient:
    app = FastAPI()
    api_router = APIRouter(prefix="/api/public")
    api_router.include_router(public_router)
    app.include_router(api_router)

    @app.exception_handler(AppError)
    async def handle_app_error(_, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=api_error(code=exc.code, message=exc.message),
        )

    initialize_database()
    return TestClient(app)


def test_project_crud() -> None:
    client = create_comic_client()

    create_response = client.post(
        "/api/public/comic/projects",
        headers=client_provider_headers(),
        json={
            "title": "Galactic Courier",
            "description": "A courier crosses collapsing star lanes.",
            "genre": "Sci-Fi",
        },
    )

    assert create_response.status_code == 201
    created_project = create_response.json()["data"]
    project_id = created_project["id"]
    assert created_project["title"] == "Galactic Courier"
    assert created_project["description"] == "A courier crosses collapsing star lanes."

    detail_response = client.get(f"/api/public/comic/projects/{project_id}")

    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["id"] == project_id

    update_response = client.patch(
        f"/api/public/comic/projects/{project_id}",
        json={
            "title": "Galactic Courier Revised",
            "description": "A courier outruns a dying empire.",
            "genre": "Space Opera",
            "status": "draft",
        },
    )

    assert update_response.status_code == 200
    assert update_response.json()["data"]["title"] == "Galactic Courier Revised"
    assert update_response.json()["data"]["genre"] == "Space Opera"

    delete_response = client.delete(f"/api/public/comic/projects/{project_id}")

    assert delete_response.status_code == 200
    assert delete_response.json()["data"] == {"deleted": True, "id": project_id}

    missing_response = client.get(f"/api/public/comic/projects/{project_id}")

    assert missing_response.status_code == 404
    assert missing_response.json()["error"]["code"] == "comic_project_not_found"


def test_delete_task_removes_task_without_deleting_project() -> None:
    client = create_comic_client()
    project_id = create_project(client)
    save_chapter(client, project_id)
    save_scene(client, project_id)
    task = create_scene_render_task(client, project_id)

    delete_response = client.delete(f"/api/public/comic/tasks/{task['id']}")
    missing_response = client.get(f"/api/public/comic/tasks/{task['id']}")
    project_response = client.get(f"/api/public/comic/projects/{project_id}")

    assert delete_response.status_code == 200
    assert delete_response.json()["data"] == {"deleted": True, "id": task["id"]}
    assert missing_response.status_code == 404
    assert missing_response.json()["error"]["code"] == "comic_task_not_found"
    assert project_response.status_code == 200
    assert project_response.json()["data"]["id"] == project_id


def test_save_characters_chapter_and_scene() -> None:
    client = create_comic_client()
    project_id = create_project(client)

    characters_response = client.put(
        f"/api/public/comic/projects/{project_id}/characters",
        json={
            "characters": [
                {
                    "name": "Mira",
                    "role": "lead",
                    "profile": "A fearless courier with a cracked compass.",
                },
                {
                    "name": "Orin",
                    "role": "support",
                    "profile": "Engineer who talks to ship ghosts.",
                },
            ]
        },
    )

    assert characters_response.status_code == 200
    characters = characters_response.json()["data"]["characters"]
    assert [item["name"] for item in characters] == ["Mira", "Orin"]

    chapter_response = client.put(
        f"/api/public/comic/projects/{project_id}/chapters/chapter-001",
        json={
            "title": "Falling Route",
            "summary": "Mira takes the last legal job in the sector.",
            "sequence": 1,
        },
    )

    assert chapter_response.status_code == 200
    assert chapter_response.json()["data"]["id"] == "chapter-001"

    scene_response = client.put(
        f"/api/public/comic/projects/{project_id}/chapters/chapter-001/scenes/scene-001",
        json={
            "title": "Dock Alarm",
            "summary": "The station seals as the client disappears.",
            "sequence": 1,
            "shots": [
                "Wide shot of the cargo dock",
                "Close-up on Mira's cracked compass",
            ],
        },
    )

    assert scene_response.status_code == 200
    assert scene_response.json()["data"]["id"] == "scene-001"
    assert scene_response.json()["data"]["shots"][1] == "Close-up on Mira's cracked compass"

    detail_response = client.get(f"/api/public/comic/projects/{project_id}")
    detail = detail_response.json()["data"]

    assert len(detail["characters"]) == 2
    assert detail["chapters"][0]["id"] == "chapter-001"
    assert detail["chapters"][0]["scenes"][0]["id"] == "scene-001"


def create_scene_render_task(client: TestClient, project_id: str) -> dict:
    response = client.post(
        "/api/public/comic/tasks",
        headers=client_provider_headers(),
        json={
            "project_id": project_id,
            "chapter_id": "chapter-001",
            "scene_id": "scene-001",
            "task_type": "scene-render",
            "input_payload": {
                "source_text": "A courier reaches the dock.",
                "style_preset": "ink_wash",
                "panels_per_image": 4,
                "target_image_count": 1,
                "generate_images": False,
            },
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


def create_project(client: TestClient) -> str:
    response = client.post(
        "/api/public/comic/projects",
        headers=client_provider_headers(),
        json={
            "title": "Galactic Courier",
            "description": "Project fixture",
            "genre": "Sci-Fi",
        },
    )
    return response.json()["data"]["id"]


def client_provider_headers() -> dict[str, str]:
    return {
        "x-client-id": "comic-domain-client",
        "x-client-provider-base-url": "https://comic-domain.example/v1",
        "x-client-provider-api-key": "sk-comic-domain",
    }


def save_chapter(client: TestClient, project_id: str) -> None:
    client.put(
        f"/api/public/comic/projects/{project_id}/chapters/chapter-001",
        json={
            "title": "Falling Route",
            "summary": "Mira takes the job.",
            "sequence": 1,
        },
    )


def save_scene(client: TestClient, project_id: str) -> None:
    client.put(
        f"/api/public/comic/projects/{project_id}/chapters/chapter-001/scenes/scene-001",
        json={
            "title": "Dock Alarm",
            "summary": "Alarm triggers.",
            "sequence": 1,
            "shots": ["Wide shot"],
        },
    )
