from __future__ import annotations

from datetime import datetime, timedelta

from apps.api.app.domains.image import job_recovery
from apps.api.app.domains.image import service as image_service
from apps.api.app.domains.image.job_failure import handle_job_failure
from apps.api.app.domains.image.models import ImageJob, ImageJobItem
from apps.api.app.domains.image.repository import complete_job, mark_job_failed
from apps.api.app.infra.db.session import session_scope
from apps.api.tests.test_image_jobs import build_client, create_queued_job_for_user, register_user
from apps.worker.worker import config as worker_config
from apps.worker.worker.tasks import image_jobs as worker_image_jobs


def test_claim_next_item_ids_sets_lease_fields() -> None:
    client = build_client()
    user = register_user(client, email="lease-claim@example.com")
    job = create_queued_job_for_user(user_id=user["id"], prompt="Claim lease image")

    with session_scope() as session:
        claimed_ids = image_service.claim_next_item_ids(
            session,
            limit=1,
            worker_name="worker-a",
            lease_seconds=42,
        )
        claimed_item = session.get(ImageJobItem, claimed_ids[0])
        claimed_job = session.get(ImageJob, job.id)

    assert claimed_item.job_id == job.id
    assert claimed_job.status == "running"
    assert claimed_item.locked_by == "worker-a"
    assert claimed_item.locked_at is not None
    assert claimed_item.heartbeat_at == claimed_item.locked_at
    assert claimed_item.lease_expires_at - claimed_item.heartbeat_at == timedelta(seconds=42)


def test_worker_claim_uses_configured_worker_name(monkeypatch) -> None:
    monkeypatch.setenv("WORKER_NAME", "configured-image-worker")
    worker_config.get_settings.cache_clear()
    client = build_client()
    user = register_user(client, email="worker-lease@example.com")
    job = create_queued_job_for_user(user_id=user["id"], prompt="Worker lease image")

    claimed = worker_image_jobs.claim_next_image_work(max_items=1)

    assert [item.job_id for item in claimed] == [job.id]
    with session_scope() as session:
        claimed_item = session.get(ImageJobItem, claimed[0].id)
    assert claimed_item.locked_by == "configured-image-worker"


def test_heartbeat_item_allows_only_locked_worker() -> None:
    client = build_client()
    user = register_user(client, email="heartbeat@example.com")
    job = create_queued_job_for_user(user_id=user["id"], prompt="Heartbeat image")
    old_heartbeat_at = datetime.utcnow() - timedelta(minutes=5)
    old_lease_expires_at = datetime.utcnow() - timedelta(minutes=4)

    with session_scope() as session:
        item_ids = image_service.claim_next_item_ids(session, limit=1, worker_name="worker-a", lease_seconds=60)
        item_id = item_ids[0]
        claimed_item = session.get(ImageJobItem, item_id)
        claimed_item.heartbeat_at = old_heartbeat_at
        claimed_item.lease_expires_at = old_lease_expires_at
        session.flush()

    with session_scope() as session:
        assert image_service.heartbeat_item(
            session,
            item_id=item_id,
            worker_name="worker-b",
            lease_seconds=120,
        ) is False
        unchanged_item = session.get(ImageJobItem, item_id)
        assert unchanged_item.heartbeat_at == old_heartbeat_at
        assert unchanged_item.lease_expires_at == old_lease_expires_at

    with session_scope() as session:
        assert image_service.heartbeat_item(
            session,
            item_id=item_id,
            worker_name="worker-a",
            lease_seconds=120,
        ) is True
        refreshed_item = session.get(ImageJobItem, item_id)
        assert refreshed_item.heartbeat_at > old_heartbeat_at
        assert refreshed_item.lease_expires_at - refreshed_item.heartbeat_at == timedelta(seconds=120)


def test_complete_job_clears_lock_fields() -> None:
    job = create_running_locked_job(email="complete-lease@example.com")

    with session_scope() as session:
        running_job = session.get(ImageJob, job.id)
        complete_job(session, job=running_job)
        completed_job = session.get(ImageJob, job.id)

    assert completed_job.status == "succeeded"
    assert_lock_fields_are_empty(completed_job)


def test_mark_job_failed_clears_lock_fields() -> None:
    job = create_running_locked_job(email="failed-lease@example.com")

    with session_scope() as session:
        running_job = session.get(ImageJob, job.id)
        mark_job_failed(session, job=running_job, error_message="provider failed")
        failed_job = session.get(ImageJob, job.id)

    assert failed_job.status == "failed"
    assert_lock_fields_are_empty(failed_job)


def test_retry_requeue_clears_lock_fields() -> None:
    job = create_running_locked_job(email="retry-lease@example.com")

    with session_scope() as session:
        running_job = session.get(ImageJob, job.id)
        handle_job_failure(
            session,
            job=running_job,
            exc=RuntimeError("temporary upstream failure"),
            retry_delay_seconds=0,
        )
        queued_job = session.get(ImageJob, job.id)

    assert queued_job.status == "queued"
    assert_lock_fields_are_empty(queued_job)


def test_recovery_requeues_expired_lease_and_clears_lock_fields() -> None:
    job = create_running_locked_job(email="expired-lease@example.com")
    with session_scope() as session:
        running_job = session.get(ImageJob, job.id)
        running_job.started_at = datetime.utcnow()
        running_job.lease_expires_at = datetime.utcnow() - timedelta(seconds=1)
        session.flush()

        job_recovery.recover_stale_running_jobs(session, stale_timeout_seconds=3600)
        recovered_job = session.get(ImageJob, job.id)

    assert recovered_job.status == "queued"
    assert recovered_job.error_code == job_recovery.IMAGE_JOB_RETRY_ERROR_CODE
    assert_lock_fields_are_empty(recovered_job)


def test_recovery_skips_unexpired_lease_even_when_started_at_is_old() -> None:
    job = create_running_locked_job(email="fresh-lease@example.com")
    with session_scope() as session:
        running_job = session.get(ImageJob, job.id)
        running_job.started_at = datetime.utcnow() - timedelta(hours=2)
        running_job.lease_expires_at = datetime.utcnow() + timedelta(minutes=5)
        session.flush()

        job_recovery.recover_stale_running_jobs(session, stale_timeout_seconds=1)
        fresh_job = session.get(ImageJob, job.id)

    assert fresh_job.status == "running"
    assert fresh_job.locked_by == "worker-a"


def test_recovery_keeps_started_at_fallback_for_legacy_running_jobs() -> None:
    job = create_running_locked_job(email="legacy-stale@example.com")
    with session_scope() as session:
        running_job = session.get(ImageJob, job.id)
        running_job.locked_by = None
        running_job.locked_at = None
        running_job.heartbeat_at = None
        running_job.lease_expires_at = None
        running_job.started_at = datetime.utcnow() - timedelta(hours=2)
        session.flush()

        job_recovery.recover_stale_running_jobs(session, stale_timeout_seconds=1)
        recovered_job = session.get(ImageJob, job.id)

    assert recovered_job.status == "queued"
    assert recovered_job.error_code == job_recovery.IMAGE_JOB_RETRY_ERROR_CODE


def create_running_locked_job(*, email: str) -> ImageJob:
    client = build_client()
    user = register_user(client, email=email)
    job = create_queued_job_for_user(user_id=user["id"], prompt=f"Locked image {email}")
    with session_scope() as session:
        running_job = session.get(ImageJob, job.id)
        running_job.status = "running"
        running_job.attempt_count = 1
        running_job.locked_by = "worker-a"
        running_job.locked_at = datetime.utcnow() - timedelta(minutes=1)
        running_job.heartbeat_at = running_job.locked_at
        running_job.lease_expires_at = datetime.utcnow() + timedelta(minutes=5)
        running_job.started_at = running_job.locked_at
        running_job.finished_at = None
        session.flush()
    return job


def assert_lock_fields_are_empty(job: ImageJob) -> None:
    assert job.locked_by is None
    assert job.locked_at is None
    assert job.heartbeat_at is None
    assert job.lease_expires_at is None
