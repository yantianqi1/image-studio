from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from apps.api.app.domains.comic.models import ComicCharacterCard, ComicTask
from apps.api.app.domains.image.models import Asset, ImageJob, ImageJobResult
from apps.api.app.domains.public_quota.constants import PUBLIC_QUOTA_MODE_PER_IP
from apps.api.app.domains.public_quota.service import get_public_quota_status
from apps.api.app.domains.settings.service import get_settings_record
from apps.api.app.infra.db.session import session_scope
from apps.worker.worker.tasks import comic_tasks as worker_comic_tasks
from apps.api.tests.test_comic_pipeline import create_comic_client, create_task, install_llm_outputs

PUBLIC_QUOTA_REQUEST_IP = "203.0.113.42"


def test_approve_character_references_enqueues_jobs(monkeypatch) -> None:
    client, task_id = create_completed_comic_task(monkeypatch, request_headers=public_quota_headers())
    clear_task_client_provider(task_id)
    use_per_ip_public_quota()
    quota_before = public_quota_used_count()

    response = client.post(f"/api/public/comic/tasks/{task_id}/character-references")

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["created_count"] == data["character_count"] == 1
    assert data["characters"][0]["reference_image_job_id"] is not None
    assert data["characters"][0]["reference_asset_id"] is None
    assert data["characters"][0]["image_status"] == "queued"
    assert quota_before == 0
    assert public_quota_used_count() == 1


def test_approve_character_references_reuses_existing_jobs(monkeypatch) -> None:
    client, task_id = create_completed_comic_task(monkeypatch, request_headers=public_quota_headers())
    clear_task_client_provider(task_id)
    use_per_ip_public_quota()

    first = client.post(f"/api/public/comic/tasks/{task_id}/character-references").json()["data"]
    quota_after_first = public_quota_used_count()
    second = client.post(f"/api/public/comic/tasks/{task_id}/character-references").json()["data"]
    quota_after_second = public_quota_used_count()

    assert first["created_count"] == 1
    assert second["created_count"] == 0
    assert second["reused_count"] == 1
    assert second["characters"][0]["reference_image_job_id"] == first["characters"][0]["reference_image_job_id"]
    assert quota_after_first == 1
    assert quota_after_second == 1


def test_approve_character_references_aligns_reference_prompt_with_style(monkeypatch) -> None:
    client, task_id = create_completed_comic_task(monkeypatch)

    response = client.post(f"/api/public/comic/tasks/{task_id}/character-references")

    assert response.status_code == 201
    job_id = response.json()["data"]["characters"][0]["reference_image_job_id"]
    prompt = reference_job_prompt(job_id)
    assert "Character reference style alignment" in prompt
    assert "Selected comic style" in prompt
    assert "Clean Baimiao Line-art Comic" in prompt
    assert "clean manhua/comic aesthetic" in prompt
    assert "reference sheet" in prompt
    assert "Page layout" not in prompt


def test_approve_character_references_falls_back_to_default_style_when_task_style_is_invalid(monkeypatch) -> None:
    client, task_id = create_completed_comic_task(monkeypatch)
    with session_scope() as session:
        task = session.get(ComicTask, task_id)
        task.input_payload = {**task.input_payload, "style_preset": "unknown-style"}

    response = client.post(f"/api/public/comic/tasks/{task_id}/character-references")

    assert response.status_code == 201
    job_id = response.json()["data"]["characters"][0]["reference_image_job_id"]
    prompt = reference_job_prompt(job_id)
    assert "Style name: Linear Neo-Chinese Comic" in prompt


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


def create_completed_comic_task(
    monkeypatch,
    *,
    request_headers: dict[str, str] | None = None,
    include_client_provider: bool = True,
) -> tuple[TestClient, str]:
    client = create_comic_client()
    task = create_task(
        client,
        headers=request_headers,
        include_client_provider=include_client_provider,
    )
    install_llm_outputs(monkeypatch)
    worker_comic_tasks.run_next_comic_task()
    return client, task["id"]


def clear_task_client_provider(task_id: str) -> None:
    with session_scope() as session:
        task = session.get(ComicTask, task_id)
        task.client_provider_config = None
        task.client_access_id = None
        session.commit()


def public_quota_headers() -> dict[str, str]:
    return {"x-forwarded-for": PUBLIC_QUOTA_REQUEST_IP}


def public_quota_used_count() -> int:
    with session_scope() as session:
        status = get_public_quota_status(session, request_ip=PUBLIC_QUOTA_REQUEST_IP)
        return int(status["used_count"])


def use_per_ip_public_quota() -> None:
    with session_scope() as session:
        record = get_settings_record(session)
        record.public_quota_mode = PUBLIC_QUOTA_MODE_PER_IP
        record.public_quota_per_ip_limit = 5


def approve_first_reference_job(client: TestClient, task_id: str) -> int:
    response = client.post(f"/api/public/comic/tasks/{task_id}/character-references")
    assert response.status_code == 201
    return response.json()["data"]["characters"][0]["reference_image_job_id"]


def seed_image_job_result(*, job_id: int, status: str) -> int:
    with session_scope() as session:
        job = session.get(ImageJob, job_id)
        job.status = status
        asset = Asset(
            owner_user_id=job.user_id,
            owner_anonymous_session_id=job.anonymous_session_id,
            storage_path=f"/tmp/ref-{job_id}.png",
            mime_type="image/png",
        )
        session.add(asset)
        session.flush()
        session.add(ImageJobResult(job_id=job_id, result_index=1, asset_id=asset.id, asset_url=f"/api/public/image/assets/{asset.id}"))
        session.flush()
        return asset.id


def reference_job_prompt(job_id: int) -> str:
    with session_scope() as session:
        return session.get(ImageJob, job_id).prompt


def mark_image_job_failed(*, job_id: int, error_message: str) -> None:
    with session_scope() as session:
        job = session.get(ImageJob, job_id)
        job.status = "failed"
        job.error_code = "image_job_failed"
        job.error_message = error_message
