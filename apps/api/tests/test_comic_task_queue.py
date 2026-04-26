from __future__ import annotations

from datetime import datetime, timedelta
from threading import Barrier, Thread

from fastapi import APIRouter, FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from sqlalchemy import select

from apps.api.app.core.config import get_settings
from apps.api.app.core.errors import AppError
from apps.api.app.core.response import api_error
from apps.api.app.domains.comic import task_processor
from apps.api.app.domains.comic.models import ComicTask
from apps.api.app.domains.comic.repository import claim_next_task, claim_task
from apps.api.app.domains.comic.router import public_router
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.worker.worker.tasks import comic_tasks as worker_comic_tasks


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


def test_create_task_only_enqueues_and_does_not_process(monkeypatch) -> None:
    client = create_comic_client()
    project_id = create_project(client)
    save_chapter(client, project_id)
    save_scene(client, project_id)
    calls: list[str] = []

    def fail_if_processed(*args, **kwargs) -> None:
        calls.append("called")
        raise AssertionError("POST /comic/tasks must not process tasks synchronously")

    monkeypatch.setattr(task_processor, "process_task", fail_if_processed)
    monkeypatch.setattr(worker_comic_tasks, "process_task", fail_if_processed)

    created_task = create_scene_render_task(client, project_id)

    assert calls == []
    assert created_task["status"] == "pending"
    assert created_task["stage"] == "queued"
    assert created_task["progress_percent"] == 0
    assert created_task["output_payload"] == {}
    assert created_task["error_code"] is None

    status_response = client.get(f"/api/public/comic/tasks/{created_task['id']}")
    task_detail = status_response.json()["data"]
    assert status_response.status_code == 200
    assert task_detail["status"] == "pending"
    assert task_detail["output_payload"] == {}


def test_create_project_requires_login_or_client_provider() -> None:
    client = create_comic_client()

    response = client.post(
        "/api/public/comic/projects",
        json={"title": "Blocked", "description": "No access", "genre": "Sci-Fi"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "login_or_client_provider_required"
    assert response.json()["error"]["message"] == "请先登录，或配置浏览器端供应商密钥后重试"


def test_create_task_stores_client_provider_context() -> None:
    client = create_comic_client()
    project_id = create_project(client)
    save_chapter(client, project_id)
    save_scene(client, project_id)

    created_task = create_scene_render_task(client, project_id)

    with session_scope() as session:
        task = load_task(session, created_task["id"])
        assert task.client_access_id == "comic-browser-client"
        assert task.client_provider_config["base_url"] == "https://comic-client.example/v1"
        assert task.client_provider_config["api_key"] == "sk-comic-client"


def test_worker_claims_and_completes_queued_task() -> None:
    client = create_comic_client()
    project_id = create_project(client)
    save_chapter(client, project_id)
    save_scene(client, project_id)
    created_task = create_scene_render_task(client, project_id)

    processed_task_id = worker_comic_tasks.run_next_comic_task()

    assert processed_task_id == created_task["id"]
    response = client.get(f"/api/public/comic/tasks/{created_task['id']}")
    task = response.json()["data"]
    assert task["status"] == "completed"
    assert task["stage"] == "completed"
    assert task["progress_percent"] == 100
    assert task["output_payload"]["local_test_output_not_llm"] is True


def test_concurrent_claim_next_task_does_not_duplicate_claims() -> None:
    client = create_comic_client()
    project_id = create_project(client)
    save_chapter(client, project_id)
    save_scene(client, project_id)
    created_task = create_scene_render_task(client, project_id)
    barrier = Barrier(2)
    results: list[tuple[str, str | None]] = []

    def claim_in_thread(worker_name: str) -> None:
        with session_scope() as session:
            barrier.wait(timeout=10)
            task = claim_next_task(session, worker_name=worker_name)
            results.append((worker_name, task.id if task is not None else None))

    threads = [
        Thread(target=claim_in_thread, args=("worker-a",)),
        Thread(target=claim_in_thread, args=("worker-b",)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)

    claimed_results = [task_id for _, task_id in results if task_id is not None]
    assert claimed_results == [created_task["id"]]
    with session_scope() as session:
        task = load_task(session, created_task["id"])
        assert task.status == "running"
        assert task.locked_by in {"worker-a", "worker-b"}
        assert task.attempt_count == 1


def test_future_available_task_is_not_claimed() -> None:
    client = create_comic_client()
    project_id = create_project(client)
    save_chapter(client, project_id)
    save_scene(client, project_id)
    created_task = create_scene_render_task(client, project_id)
    future_time = datetime.utcnow() + timedelta(hours=1)
    set_task_queue_state(created_task["id"], status="pending", available_at=future_time)

    with session_scope() as session:
        claimed_task = claim_next_task(session, worker_name="worker-a")

    assert claimed_task is None
    with session_scope() as session:
        task = load_task(session, created_task["id"])
        assert task.status == "pending"
        assert task.locked_by is None


def test_due_queued_task_can_be_claimed() -> None:
    client = create_comic_client()
    project_id = create_project(client)
    save_chapter(client, project_id)
    save_scene(client, project_id)
    created_task = create_scene_render_task(client, project_id)
    past_time = datetime.utcnow() - timedelta(seconds=1)
    set_task_queue_state(created_task["id"], status="queued", available_at=past_time)

    with session_scope() as session:
        claimed_task = claim_next_task(session, worker_name="worker-a")

    assert claimed_task is not None
    assert claimed_task.id == created_task["id"]
    assert claimed_task.status == "running"
    assert claimed_task.locked_by == "worker-a"


def test_claim_task_rechecks_available_at_during_update() -> None:
    client = create_comic_client()
    project_id = create_project(client)
    save_chapter(client, project_id)
    save_scene(client, project_id)
    created_task = create_scene_render_task(client, project_id)
    selected_at = datetime.utcnow()
    future_time = selected_at + timedelta(hours=1)
    set_task_queue_state(created_task["id"], status="pending", available_at=future_time)

    with session_scope() as session:
        claimed = claim_task(
            session,
            task_id=created_task["id"],
            worker_name="worker-a",
            current_time=selected_at,
        )

    assert claimed is False
    with session_scope() as session:
        task = load_task(session, created_task["id"])
        assert task.status == "pending"
        assert task.locked_by is None
        assert task.attempt_count == 0


def test_worker_without_llm_config_fails_explicitly(monkeypatch) -> None:
    client = create_comic_client()
    project_id = create_project(client)
    save_chapter(client, project_id)
    save_scene(client, project_id)
    created_task = create_scene_render_task(client, project_id)
    with session_scope() as session:
        task = load_task(session, created_task["id"])
        task.client_access_id = None
        task.client_provider_config = None
        session.flush()
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("OPENAI_PROVIDER_API_KEY_ENV", "MISSING_COMIC_TEST_PROVIDER_KEY")
    monkeypatch.delenv("MISSING_COMIC_TEST_PROVIDER_KEY", raising=False)
    get_settings.cache_clear()

    processed_task_id = worker_comic_tasks.run_next_comic_task()

    get_settings.cache_clear()
    assert processed_task_id == created_task["id"]
    response = client.get(f"/api/public/comic/tasks/{created_task['id']}")
    task = response.json()["data"]
    assert task["status"] == "failed"
    assert task["error_code"] == "comic_llm_not_configured"
    assert "not configured" in task["error_message"]


def test_worker_failure_marks_task_failed(monkeypatch) -> None:
    client = create_comic_client()
    project_id = create_project(client)
    save_chapter(client, project_id)
    save_scene(client, project_id)
    created_task = create_scene_render_task(client, project_id)

    def fail_output(*, task: ComicTask) -> dict:
        raise RuntimeError(f"pipeline exploded for {task.id}")

    monkeypatch.setattr(task_processor, "build_local_test_output", fail_output)
    processed_task_id = worker_comic_tasks.run_next_comic_task()

    assert processed_task_id == created_task["id"]
    response = client.get(f"/api/public/comic/tasks/{created_task['id']}")
    task = response.json()["data"]
    assert task["status"] == "failed"
    assert task["stage"] == "failed"
    assert task["error_code"] == "comic_task_failed"
    assert "pipeline exploded" in task["error_message"]


def set_task_queue_state(task_id: str, *, status: str, available_at: datetime) -> None:
    with session_scope() as session:
        task = load_task(session, task_id)
        task.status = status
        task.available_at = available_at
        task.locked_by = None
        task.locked_at = None
        task.started_at = None
        task.attempt_count = 0
        session.flush()


def load_task(session, task_id: str) -> ComicTask:
    return session.execute(select(ComicTask).where(ComicTask.id == task_id)).scalar_one()


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
        "x-client-id": "comic-browser-client",
        "x-client-provider-base-url": "https://comic-client.example/v1",
        "x-client-provider-api-key": "sk-comic-client",
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
