from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select

from apps.api.app.domains.image import service as image_service
from apps.api.app.domains.image.models import ImageJob, ImageJobItem
from apps.api.app.infra.db.session import session_scope
from apps.worker.worker import config as worker_config
from apps.worker.worker import main as worker_main
from apps.api.tests.test_image_jobs import build_client, register_user


def test_claim_next_job_ids_claims_queued_job_with_sqlite_fallback() -> None:
    client = build_client()
    register_user(client, email="claim-queued@example.com")
    job = create_member_job(client, prompt="Claim one queued image")
    remove_job_items(job["id"])

    with session_scope() as session:
        claimed_ids = image_service.claim_next_job_ids(session, limit=1)
        claimed_job = session.get(ImageJob, job["id"])

    assert claimed_ids == [job["id"]]
    assert claimed_job.status == "running"
    assert claimed_job.attempt_count == 1
    assert claimed_job.started_at is not None
    assert claimed_job.finished_at is None


def test_claim_next_job_ids_respects_limit_with_sqlite_fallback() -> None:
    client = build_client()
    register_user(client, email="claim-limit@example.com")
    job_ids = [create_member_job(client, prompt=f"Claim limit {index}")["id"] for index in range(1, 4)]
    for job_id in job_ids:
        remove_job_items(job_id)

    with session_scope() as session:
        claimed_ids = image_service.claim_next_job_ids(session, limit=2)
        jobs = list(session.execute(select(ImageJob).where(ImageJob.id.in_(job_ids))).scalars())
        statuses_by_id = {job.id: job.status for job in jobs}

    assert claimed_ids == job_ids[:2]
    assert [statuses_by_id[job_id] for job_id in job_ids[:2]] == ["running", "running"]
    assert statuses_by_id[job_ids[2]] == "queued"


def test_claim_next_job_ids_skips_non_queued_jobs_with_sqlite_fallback() -> None:
    client = build_client()
    register_user(client, email="claim-status@example.com")
    job = create_member_job(client, prompt="Do not claim completed image")
    with session_scope() as session:
        session.get(ImageJob, job["id"]).status = "succeeded"

    with session_scope() as session:
        claimed_ids = image_service.claim_next_job_ids(session, limit=1)
        skipped_job = session.get(ImageJob, job["id"])

    assert claimed_ids == []
    assert skipped_job.status == "succeeded"


def test_claim_next_job_ids_skips_future_available_jobs_with_sqlite_fallback() -> None:
    client = build_client()
    register_user(client, email="claim-future@example.com")
    job = create_member_job(client, prompt="Do not claim future image")
    future_available_at = datetime.utcnow() + timedelta(hours=1)
    with session_scope() as session:
        session.get(ImageJob, job["id"]).available_at = future_available_at

    with session_scope() as session:
        claimed_ids = image_service.claim_next_job_ids(session, limit=1)
        skipped_job = session.get(ImageJob, job["id"])

    assert claimed_ids == []
    assert skipped_job.status == "queued"
    assert skipped_job.available_at == future_available_at


def test_postgres_claim_sql_uses_skip_locked_and_limit_parameter() -> None:
    claim_sql = image_service.POSTGRES_CLAIM_JOB_IDS_SQL

    assert "FOR UPDATE SKIP LOCKED" in claim_sql
    assert "LIMIT :limit" in claim_sql
    assert "RETURNING image_jobs.id" in claim_sql


def test_python_worker_settings_do_not_expose_image_job_concurrency(monkeypatch) -> None:
    monkeypatch.setenv("WORKER_IMAGE_JOB_CONCURRENCY", "4")
    worker_config.get_settings.cache_clear()

    assert not hasattr(worker_config.get_settings(), "worker_image_job_concurrency")


def test_python_worker_main_has_no_image_jobs_branch() -> None:
    assert not hasattr(worker_main, "run_image_jobs_branch_once")
    assert "image-jobs" not in [branch.name for branch in worker_main.build_worker_branches()]


def test_worker_run_once_ignores_removed_image_jobs_flag(monkeypatch) -> None:
    calls: list[str] = []

    def process_comic_task() -> str:
        calls.append("comic-task")
        return "comic-task-1"

    def process_comic_orchestration() -> None:
        calls.append("comic-orchestration")
        return None

    monkeypatch.setenv("WORKER_ENABLE_IMAGE_JOBS", "true")
    worker_config.get_settings.cache_clear()
    monkeypatch.setattr(worker_main, "run_next_comic_task", process_comic_task)
    monkeypatch.setattr(worker_main, "run_next_comic_orchestration", process_comic_orchestration)

    message = worker_main.run_once()

    assert sorted(calls) == ["comic-orchestration", "comic-task"]
    assert message == "Processed comic task comic-task-1."


def test_serve_forever_starts_independent_worker_branches(monkeypatch) -> None:
    submitted_branches: list[str] = []
    max_workers_seen: list[int] = []

    class CompletedFuture:
        def result(self) -> None:
            return None

    class CapturingExecutor:
        def __init__(self, *, max_workers: int) -> None:
            max_workers_seen.append(max_workers)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback) -> None:
            return None

        def submit(self, _fn, *, branch, poll_interval_seconds):
            assert poll_interval_seconds == 1.0
            submitted_branches.append(branch.name)
            return CompletedFuture()

    monkeypatch.setattr(worker_main, "ThreadPoolExecutor", CapturingExecutor)
    monkeypatch.setattr(worker_main, "wait_for_worker_branch_failure", lambda _futures: None)

    monkeypatch.setenv("WORKER_ENABLE_IMAGE_JOBS", "true")
    worker_config.get_settings.cache_clear()

    worker_main.serve_forever()

    assert max_workers_seen == [2]
    assert submitted_branches == ["comic-task", "comic-orchestration"]


def create_member_job(client, *, prompt: str) -> dict[str, object]:
    response = client.post(
        "/api/public/image/jobs",
        json={"prompt": prompt, "model_code": "gpt-image-2", "requested_count": 1},
    )
    assert response.status_code == 201
    return response.json()["data"]


def remove_job_items(job_id: int) -> None:
    with session_scope() as session:
        items = list(session.execute(select(ImageJobItem).where(ImageJobItem.job_id == job_id)).scalars())
        for item in items:
            session.delete(item)
