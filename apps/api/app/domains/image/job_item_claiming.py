from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from apps.api.app.domains.image.job_claiming import (
    DEFAULT_IMAGE_JOB_LEASE_SECONDS,
    DEFAULT_IMAGE_JOB_WORKER_NAME,
    validate_positive,
)
from apps.api.app.domains.image.job_items import aggregate_parent_job_status, clear_item_lock
from apps.api.app.domains.image.job_recovery import IMAGE_JOB_RETRY_ERROR_CODE
from apps.api.app.domains.image.events import record_image_job_item_event
from apps.api.app.domains.image.models import ImageJob, ImageJobItem

POSTGRES_CLAIM_ITEM_IDS_SQL = (
    "WITH picked AS ( "
    "SELECT i.id FROM image_job_items i "
    "JOIN image_jobs j ON j.id = i.job_id "
    "WHERE i.status = 'queued' AND i.available_at <= :current_time "
    "AND i.dead_letter_at IS NULL "
    "AND i.cancelled_at IS NULL "
    "AND j.status IN ('queued', 'running') "
    "ORDER BY i.priority DESC, i.scheduler_score DESC, i.available_at ASC, i.id ASC "
    "FOR UPDATE SKIP LOCKED LIMIT :limit "
    ") UPDATE image_job_items SET status = 'running', attempt_count = attempt_count + 1, "
    "started_at = :current_time, locked_by = :worker_name, locked_at = :current_time, "
    "heartbeat_at = :current_time, lease_expires_at = :lease_expires_at, "
    "finished_at = NULL, error_code = NULL, error_message = NULL "
    "FROM picked WHERE image_job_items.id = picked.id RETURNING image_job_items.id"
)


def claim_next_item_ids(
    session: Session,
    *,
    limit: int,
    stale_timeout_seconds: int,
    worker_name: str = DEFAULT_IMAGE_JOB_WORKER_NAME,
    lease_seconds: int = DEFAULT_IMAGE_JOB_LEASE_SECONDS,
) -> list[int]:
    validate_positive(value=limit, name="limit")
    validate_positive(value=lease_seconds, name="lease_seconds")
    recover_stale_running_items(session, stale_timeout_seconds=stale_timeout_seconds)
    current_time = datetime.utcnow()
    lease_expires_at = current_time + timedelta(seconds=lease_seconds)
    if session.bind and session.bind.dialect.name == "postgresql":
        item_ids = claim_item_ids_with_postgres(session, limit, worker_name, current_time, lease_expires_at)
    else:
        item_ids = claim_item_ids_with_conditional_update(session, limit, worker_name, current_time, lease_expires_at)
    record_claimed_item_events(session, item_ids=item_ids)
    aggregate_parent_jobs_for_items(session, item_ids=item_ids)
    return item_ids


def claim_item_ids_with_postgres(
    session: Session,
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
    return list(session.execute(text(POSTGRES_CLAIM_ITEM_IDS_SQL), params).scalars())


def claim_item_ids_with_conditional_update(
    session: Session,
    limit: int,
    worker_name: str,
    current_time: datetime,
    lease_expires_at: datetime,
) -> list[int]:
    item_ids = select_available_item_ids(session, limit=limit, current_time=current_time)
    claimed_ids: list[int] = []
    for item_id in item_ids:
        if claim_item(session, item_id, worker_name, current_time, lease_expires_at):
            claimed_ids.append(item_id)
    return claimed_ids


def select_available_item_ids(session: Session, *, limit: int, current_time: datetime) -> list[int]:
    statement = (
        select(ImageJobItem.id)
        .join(ImageJob, ImageJob.id == ImageJobItem.job_id)
        .where(
            ImageJobItem.status == "queued",
            ImageJobItem.available_at <= current_time,
            ImageJobItem.dead_letter_at.is_(None),
            ImageJobItem.cancelled_at.is_(None),
            ImageJob.status.in_(("queued", "running")),
        )
        .order_by(
            ImageJobItem.priority.desc(),
            ImageJobItem.scheduler_score.desc(),
            ImageJobItem.available_at.asc(),
            ImageJobItem.id.asc(),
        )
        .limit(limit)
    )
    return list(session.execute(statement).scalars())


def claim_item(
    session: Session,
    item_id: int,
    worker_name: str,
    current_time: datetime,
    lease_expires_at: datetime,
) -> bool:
    statement = (
        update(ImageJobItem)
        .where(
            ImageJobItem.id == item_id,
            ImageJobItem.status == "queued",
            ImageJobItem.dead_letter_at.is_(None),
            ImageJobItem.cancelled_at.is_(None),
        )
        .values(
            status="running",
            attempt_count=ImageJobItem.attempt_count + 1,
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


def recover_stale_running_items(session: Session, *, stale_timeout_seconds: int) -> None:
    now = datetime.utcnow()
    expired_at = now - timedelta(seconds=stale_timeout_seconds)
    items = list(session.execute(select(ImageJobItem).where(stale_item_filter(now, expired_at))).scalars())
    job_ids = {item.job_id for item in items}
    for item in items:
        item.status = "queued"
        item.error_code = IMAGE_JOB_RETRY_ERROR_CODE
        item.error_message = "image job item lease expired"
        item.last_error_code = IMAGE_JOB_RETRY_ERROR_CODE
        item.last_error_message = "image job item lease expired"
        item.available_at = now
        item.finished_at = None
        clear_item_lock(item)
        record_image_job_item_event(session, item=item, event_type="image_job_item.retry_scheduled")
    for job_id in job_ids:
        aggregate_parent_job_status(session, job_id=job_id)


def stale_item_filter(now: datetime, expired_at: datetime):
    return (
        (ImageJobItem.status == "running")
        & (
            (ImageJobItem.lease_expires_at.is_not(None) & (ImageJobItem.lease_expires_at <= now))
            | (ImageJobItem.lease_expires_at.is_(None) & (ImageJobItem.started_at <= expired_at))
        )
    )


def heartbeat_item(session: Session, *, item_id: int, worker_name: str, lease_seconds: int) -> bool:
    validate_positive(value=lease_seconds, name="lease_seconds")
    current_time = datetime.utcnow()
    statement = (
        update(ImageJobItem)
        .where(ImageJobItem.id == item_id, ImageJobItem.status == "running", ImageJobItem.locked_by == worker_name)
        .values(heartbeat_at=current_time, lease_expires_at=current_time + timedelta(seconds=lease_seconds))
    )
    return session.execute(statement).rowcount > 0


def aggregate_parent_jobs_for_items(session: Session, *, item_ids: list[int]) -> None:
    if not item_ids:
        return
    for job_id in load_job_ids_for_items(session, item_ids=item_ids):
        aggregate_parent_job_status(session, job_id=job_id)


def load_job_ids_for_items(session: Session, *, item_ids: list[int]) -> set[int]:
    statement = select(ImageJobItem.job_id).where(ImageJobItem.id.in_(item_ids))
    return set(session.execute(statement).scalars())


def record_claimed_item_events(session: Session, *, item_ids: list[int]) -> None:
    if not item_ids:
        return
    statement = select(ImageJobItem).where(ImageJobItem.id.in_(item_ids)).order_by(ImageJobItem.id.asc())
    for item in session.execute(statement).scalars():
        record_image_job_item_event(session, item=item, event_type="image_job_item.started")
