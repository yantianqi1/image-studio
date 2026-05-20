from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import exists, select, text, update
from sqlalchemy.orm import Session

from apps.api.app.domains.image.job_recovery import recover_stale_running_jobs
from apps.api.app.domains.image.models import ImageJob
from apps.api.app.domains.image.models import ImageJobItem

DEFAULT_IMAGE_JOB_LEASE_SECONDS = 600
DEFAULT_IMAGE_JOB_WORKER_NAME = "python-worker"
POSTGRES_CLAIM_JOB_IDS_SQL = (
    "WITH picked AS ( "
    "SELECT id FROM image_jobs WHERE status = 'queued' AND available_at <= :current_time "
    "AND NOT EXISTS (SELECT 1 FROM image_job_items WHERE job_id = image_jobs.id) "
    "ORDER BY available_at ASC, id ASC FOR UPDATE SKIP LOCKED LIMIT :limit "
    ") UPDATE image_jobs SET status = 'running', attempt_count = attempt_count + 1, "
    "started_at = :current_time, locked_by = :worker_name, locked_at = :current_time, "
    "heartbeat_at = :current_time, lease_expires_at = :lease_expires_at, "
    "finished_at = NULL, error_code = NULL, error_message = NULL "
    "FROM picked WHERE image_jobs.id = picked.id RETURNING image_jobs.id"
)


def claim_next_job_ids(
    session: Session,
    *,
    limit: int,
    stale_timeout_seconds: int,
    worker_name: str = DEFAULT_IMAGE_JOB_WORKER_NAME,
    lease_seconds: int = DEFAULT_IMAGE_JOB_LEASE_SECONDS,
) -> list[int]:
    validate_positive(value=limit, name="limit")
    validate_positive(value=lease_seconds, name="lease_seconds")
    recover_stale_running_jobs(session, stale_timeout_seconds=stale_timeout_seconds)
    current_time = datetime.utcnow()
    lease_expires_at = current_time + timedelta(seconds=lease_seconds)
    if session.bind and session.bind.dialect.name == "postgresql":
        return claim_job_ids_with_postgres(
            session,
            limit=limit,
            worker_name=worker_name,
            current_time=current_time,
            lease_expires_at=lease_expires_at,
        )
    return claim_next_job_ids_with_conditional_update(
        session,
        limit=limit,
        worker_name=worker_name,
        current_time=current_time,
        lease_expires_at=lease_expires_at,
    )


def claim_job_ids_with_postgres(
    session: Session,
    *,
    limit: int,
    worker_name: str,
    current_time: datetime,
    lease_expires_at: datetime,
) -> list[int]:
    params = {
        "limit": limit,
        "worker_name": worker_name,
        "current_time": current_time,
        "lease_expires_at": lease_expires_at,
    }
    return list(session.execute(text(POSTGRES_CLAIM_JOB_IDS_SQL), params).scalars())


def claim_next_job_ids_with_conditional_update(
    session: Session,
    *,
    limit: int,
    worker_name: str,
    current_time: datetime,
    lease_expires_at: datetime,
) -> list[int]:
    job_ids = list(
        session.execute(
            select(ImageJob.id)
            .where(
                ImageJob.status == "queued",
                ImageJob.available_at <= current_time,
                ~exists().where(ImageJobItem.job_id == ImageJob.id),
            )
            .order_by(ImageJob.available_at.asc(), ImageJob.id.asc())
            .limit(limit)
        ).scalars()
    )
    claimed_ids: list[int] = []
    for job_id in job_ids:
        if claim_job(
            session,
            job_id=job_id,
            worker_name=worker_name,
            current_time=current_time,
            lease_expires_at=lease_expires_at,
        ):
            claimed_ids.append(job_id)
    return claimed_ids


def claim_job(
    session: Session,
    *,
    job_id: int,
    worker_name: str,
    current_time: datetime,
    lease_expires_at: datetime,
) -> bool:
    statement = (
        update(ImageJob)
        .where(ImageJob.id == job_id, ImageJob.status == "queued", ImageJob.available_at <= current_time)
        .values(
            status="running",
            attempt_count=ImageJob.attempt_count + 1,
            started_at=current_time,
            locked_by=worker_name,
            locked_at=current_time,
            heartbeat_at=current_time,
            lease_expires_at=lease_expires_at,
            finished_at=None,
            error_code=None,
            error_message=None,
        )
    )
    return session.execute(statement).rowcount > 0


def heartbeat_job(session: Session, *, job_id: int, worker_name: str, lease_seconds: int) -> bool:
    validate_positive(value=lease_seconds, name="lease_seconds")
    current_time = datetime.utcnow()
    statement = (
        update(ImageJob)
        .where(ImageJob.id == job_id, ImageJob.status == "running", ImageJob.locked_by == worker_name)
        .values(
            heartbeat_at=current_time,
            lease_expires_at=current_time + timedelta(seconds=lease_seconds),
        )
    )
    return session.execute(statement).rowcount > 0


def validate_positive(*, value: int, name: str) -> None:
    if value < 1:
        raise ValueError(f"{name} must be at least 1 for image job lease operations")
