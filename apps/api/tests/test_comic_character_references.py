from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from apps.api.app.domains.comic.models import ComicCharacterCard
from apps.api.app.domains.image.models import Asset, ImageJob, ImageJobResult
from apps.api.app.infra.db.session import session_scope
from apps.worker.worker.tasks import comic_tasks as worker_comic_tasks
from apps.api.tests.test_comic_pipeline import create_comic_client, create_task, install_llm_outputs


def test_approve_character_references_enqueues_jobs(monkeypatch) -> None:
    client, task_id = create_completed_comic_task(monkeypatch)

    response = client.post(f"/api/public/comic/tasks/{task_id}/character-references")

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["created_count"] == data["character_count"] == 1
    assert data["characters"][0]["reference_image_job_id"] is not None
    assert data["characters"][0]["reference_asset_id"] is None
    assert data["characters"][0]["image_status"] == "queued"


def test_approve_character_references_reuses_existing_jobs(monkeypatch) -> None:
    client, task_id = create_completed_comic_task(monkeypatch)

    first = client.post(f"/api/public/comic/tasks/{task_id}/character-references").json()["data"]
    second = client.post(f"/api/public/comic/tasks/{task_id}/character-references").json()["data"]

    assert first["created_count"] == 1
    assert second["created_count"] == 0
    assert second["reused_count"] == 1
    assert second["characters"][0]["reference_image_job_id"] == first["characters"][0]["reference_image_job_id"]


def test_sync_character_references_persists_completed_assets(monkeypatch) -> None:
    client, task_id = create_completed_comic_task(monkeypatch)
    job_id = approve_first_reference_job(client, task_id)
    asset_id = seed_image_job_result(job_id=job_id, status="succeeded")

    response = client.post(f"/api/public/comic/tasks/{task_id}/character-references/sync")

    assert response.status_code == 200
    character = response.json()["data"]["characters"][0]
    assert character["reference_asset_id"] == asset_id
    assert character["image_status"] == "succeeded"


def test_sync_character_references_reports_failed_reference_jobs(monkeypatch) -> None:
    client, task_id = create_completed_comic_task(monkeypatch)
    job_id = approve_first_reference_job(client, task_id)
    mark_image_job_failed(job_id=job_id, error_message="provider rejected reference")

    response = client.post(f"/api/public/comic/tasks/{task_id}/character-references/sync")

    assert response.status_code == 200
    character = response.json()["data"]["characters"][0]
    assert character["reference_asset_id"] is None
    assert character["image_status"] == "failed"
    assert character["error_message"] == "provider rejected reference"


def test_approve_character_references_requires_completed_task(monkeypatch) -> None:
    client = create_comic_client()
    task = create_task(client)

    response = client.post(f"/api/public/comic/tasks/{task['id']}/character-references")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "comic_task_not_ready"


def create_completed_comic_task(monkeypatch) -> tuple[TestClient, str]:
    client = create_comic_client()
    task = create_task(client)
    install_llm_outputs(monkeypatch)
    worker_comic_tasks.run_next_comic_task()
    return client, task["id"]


def approve_first_reference_job(client: TestClient, task_id: str) -> int:
    response = client.post(f"/api/public/comic/tasks/{task_id}/character-references")
    assert response.status_code == 201
    return response.json()["data"]["characters"][0]["reference_image_job_id"]


def seed_image_job_result(*, job_id: int, status: str) -> int:
    with session_scope() as session:
        job = session.get(ImageJob, job_id)
        job.status = status
        asset = Asset(owner_user_id=None, storage_path=f"/tmp/ref-{job_id}.png", mime_type="image/png")
        session.add(asset)
        session.flush()
        session.add(ImageJobResult(job_id=job_id, result_index=1, asset_id=asset.id, asset_url=f"/api/public/image/assets/{asset.id}"))
        session.flush()
        return asset.id


def mark_image_job_failed(*, job_id: int, error_message: str) -> None:
    with session_scope() as session:
        job = session.get(ImageJob, job_id)
        job.status = "failed"
        job.error_code = "image_job_failed"
        job.error_message = error_message
