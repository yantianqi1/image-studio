from datetime import datetime

from sqlalchemy import select

from apps.api.app.domains.image.models import ImageJob, ImageJobItem, ProviderRuntimeState
from apps.api.app.domains.llm.models import Provider
from apps.api.app.infra.db.session import session_scope
from apps.api.tests.test_admin_image_jobs import admin_login, build_client, seed_admin


def test_admin_dead_letter_items_and_manual_retry():
    client = build_client()
    seed_admin()
    with session_scope() as session:
        item_id = seed_dead_letter_item(session)
    admin_login(client)

    list_response = client.get("/api/admin/image/dead-letter-items")
    assert list_response.status_code == 200
    payload = list_response.json()["data"]
    assert payload["items"][0]["item_id"] == item_id
    assert payload["items"][0]["last_error_message"] == "provider failed"

    retry_response = client.post(f"/api/admin/image/items/{item_id}/retry")
    assert retry_response.status_code == 200
    with session_scope() as session:
        retried = session.get(ImageJobItem, item_id)
        assert retried.status == "queued"
        assert retried.dead_letter_at is None
        assert retried.manual_retry_count == 1


def test_admin_rejects_retry_for_succeeded_image_job_item():
    client = build_client()
    seed_admin()
    with session_scope() as session:
        item_id = seed_succeeded_item(session)
    admin_login(client)

    response = client.post(f"/api/admin/image/items/{item_id}/retry")

    assert response.status_code == 409
    with session_scope() as session:
        item = session.get(ImageJobItem, item_id)
        assert item.status == "succeeded"
        assert item.manual_retry_count == 0


def test_admin_can_update_image_job_priority():
    client = build_client()
    seed_admin()
    with session_scope() as session:
        job_id = seed_queued_item(session)
    admin_login(client)

    response = client.post(f"/api/admin/image/jobs/{job_id}/priority", json={"priority": 9})

    assert response.status_code == 200
    with session_scope() as session:
        item = session.execute(select(ImageJobItem).where(ImageJobItem.job_id == job_id)).scalar_one()
        assert item.priority == 9


def test_admin_can_cancel_image_job_item():
    client = build_client()
    seed_admin()
    with session_scope() as session:
        item_id = seed_running_item(session)
    admin_login(client)

    response = client.post(f"/api/admin/image/items/{item_id}/cancel")

    assert response.status_code == 200
    with session_scope() as session:
        cancelled = session.get(ImageJobItem, item_id)
        assert cancelled.status == "cancelled"
        assert cancelled.cancelled_at is not None
        assert cancelled.locked_by is None
        assert session.get(ImageJob, cancelled.job_id).status == "cancelled"


def test_admin_rejects_cancel_for_succeeded_image_job_item():
    client = build_client()
    seed_admin()
    with session_scope() as session:
        item_id = seed_succeeded_item(session)
    admin_login(client)

    response = client.post(f"/api/admin/image/items/{item_id}/cancel")

    assert response.status_code == 409
    with session_scope() as session:
        item = session.get(ImageJobItem, item_id)
        assert item.status == "succeeded"
        assert item.cancelled_at is None


def test_admin_can_retry_failed_image_job():
    client = build_client()
    seed_admin()
    with session_scope() as session:
        job_id = seed_failed_job(session)
    admin_login(client)

    response = client.post(f"/api/admin/image/jobs/{job_id}/retry")

    assert response.status_code == 200
    assert response.json()["data"]["updated_items"] == 1
    with session_scope() as session:
        retried = session.execute(
            select(ImageJobItem).where(ImageJobItem.job_id == job_id, ImageJobItem.result_index == 2)
        ).scalar_one()
        assert retried.status == "queued"
        assert retried.dead_letter_at is None
        assert retried.manual_retry_count == 1
        assert session.get(ImageJob, job_id).status == "queued"


def test_admin_can_cancel_image_job():
    client = build_client()
    seed_admin()
    with session_scope() as session:
        job_id = seed_running_job(session)
    admin_login(client)

    response = client.post(f"/api/admin/image/jobs/{job_id}/cancel")

    assert response.status_code == 200
    with session_scope() as session:
        job = session.get(ImageJob, job_id)
        statuses = list(session.execute(select(ImageJobItem.status).where(ImageJobItem.job_id == job_id)).scalars())
        assert job.status == "cancelled"
        assert sorted(statuses) == ["cancelled", "cancelled"]


def test_admin_can_pause_and_resume_provider_runtime_state():
    client = build_client()
    seed_admin()
    with session_scope() as session:
        provider_id = seed_provider(session)
    admin_login(client)

    pause_response = client.post(f"/api/admin/image/providers/{provider_id}/pause")
    providers_response = client.get("/api/admin/providers")
    resume_response = client.post(f"/api/admin/image/providers/{provider_id}/resume")

    assert pause_response.status_code == 200
    assert pause_response.json()["data"]["status"] == "paused"
    provider_payload = providers_response.json()["data"][0]
    assert provider_payload["runtime_state"]["status"] == "paused"
    assert resume_response.status_code == 200
    assert resume_response.json()["data"]["status"] == "healthy"
    with session_scope() as session:
        state = session.get(ProviderRuntimeState, provider_id)
        assert state.status == "healthy"
        assert state.failure_count == 0


def seed_dead_letter_item(session) -> int:
    job = add_image_job(session, prompt="Dead letter image", status="failed")
    item = ImageJobItem(
        job_id=job.id,
        result_index=1,
        status="failed",
        error_code="image_job_failed",
        error_message="provider failed",
        last_error_code="image_job_failed",
        last_error_message="provider failed",
        dead_letter_at=datetime.utcnow(),
    )
    session.add(item)
    session.flush()
    return item.id


def seed_queued_item(session) -> int:
    job = add_image_job(session, prompt="Priority image", status="queued")
    session.add(ImageJobItem(job_id=job.id, result_index=1, status="queued", priority=0))
    session.flush()
    return job.id


def seed_running_item(session) -> int:
    job = add_image_job(session, prompt="Cancel one image", status="running")
    item = ImageJobItem(
        job_id=job.id,
        result_index=1,
        status="running",
        locked_by="go-worker",
        locked_at=datetime.utcnow(),
        heartbeat_at=datetime.utcnow(),
    )
    session.add(item)
    session.flush()
    return item.id


def seed_succeeded_item(session) -> int:
    job = add_image_job(session, prompt="Completed image", status="succeeded")
    item = ImageJobItem(job_id=job.id, result_index=1, status="succeeded")
    session.add(item)
    session.flush()
    return item.id


def seed_failed_job(session) -> int:
    job = add_image_job(session, prompt="Retry failed image job", status="failed", requested_count=2)
    job.error_code = "image_job_failed"
    job.error_message = "provider failed"
    session.add_all([
        ImageJobItem(job_id=job.id, result_index=1, status="succeeded"),
        ImageJobItem(
            job_id=job.id,
            result_index=2,
            status="failed",
            dead_letter_at=datetime.utcnow(),
            error_code="image_job_failed",
            error_message="provider failed",
        ),
    ])
    session.flush()
    return job.id


def seed_running_job(session) -> int:
    job = add_image_job(session, prompt="Cancel entire job", status="running", requested_count=2)
    session.add_all([
        ImageJobItem(job_id=job.id, result_index=1, status="running", locked_by="go-worker"),
        ImageJobItem(job_id=job.id, result_index=2, status="queued"),
    ])
    session.flush()
    return job.id


def seed_provider(session) -> int:
    provider = Provider(
        name="pause-provider",
        type="openai-compatible",
        base_url="https://provider.test/v1",
        api_key_env="PAUSE_PROVIDER_KEY",
        default_model="gpt-image-2",
    )
    session.add(provider)
    session.flush()
    return provider.id


def add_image_job(session, *, prompt: str, status: str, requested_count: int = 1) -> ImageJob:
    job = ImageJob(
        source="admin",
        mode="generate",
        prompt=prompt,
        model_code="gpt-image-2",
        status=status,
        requested_count=requested_count,
    )
    session.add(job)
    session.flush()
    return job
