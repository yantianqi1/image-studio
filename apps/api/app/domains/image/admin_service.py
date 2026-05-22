from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.image.events import record_image_job_item_event, record_image_job_status_event
from apps.api.app.domains.image.models import ImageJob, ImageJobItem, ImageJobResult, ProviderRuntimeState
from apps.api.app.domains.image.job_items import aggregate_parent_job_status, clear_item_lock
from apps.api.app.domains.llm.models import Provider
from apps.api.app.domains.image.repository import list_jobs, list_results_for_jobs

ADMIN_CANCEL_REASON = "admin_cancelled"
RETRYABLE_ADMIN_ITEM_STATUSES = {"failed", "cancelled"}
CANCELLABLE_ADMIN_ITEM_STATUSES = {"queued", "running", "failed"}


def list_admin_jobs_with_results(session: Session) -> list[tuple[ImageJob, list[ImageJobResult]]]:
    jobs = list_jobs(session)
    results_by_job_id = list_results_for_jobs(session, [job.id for job in jobs])
    return [(job, results_by_job_id.get(job.id, [])) for job in jobs]


def list_admin_jobs_paginated(
    session: Session,
    *,
    page: int = 1,
    page_size: int = 50,
    status: str | None = None,
) -> dict:
    base = select(ImageJob)
    count_base = select(func.count(ImageJob.id))

    if status:
        base = base.where(ImageJob.status == status)
        count_base = count_base.where(ImageJob.status == status)

    total = int(session.execute(count_base).scalar_one())
    offset = (page - 1) * page_size
    jobs = list(
        session.execute(
            base.order_by(ImageJob.id.desc()).offset(offset).limit(page_size)
        ).scalars()
    )
    results_by_job_id = list_results_for_jobs(session, [job.id for job in jobs])

    return {
        "items": [(job, results_by_job_id.get(job.id, [])) for job in jobs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def list_dead_letter_items(session: Session) -> list[tuple[ImageJobItem, ImageJob]]:
    statement = (
        select(ImageJobItem, ImageJob)
        .join(ImageJob, ImageJob.id == ImageJobItem.job_id)
        .where(ImageJobItem.dead_letter_at.is_not(None))
        .order_by(ImageJobItem.dead_letter_at.desc(), ImageJobItem.id.desc())
    )
    return list(session.execute(statement).all())


def retry_dead_letter_item(session: Session, *, item_id: int) -> ImageJobItem:
    item = require_image_job_item(session, item_id=item_id)
    require_retryable_item(item)
    requeue_item(item)
    record_image_job_item_event(session, item=item, event_type="image_job_item.retry_scheduled")
    aggregate_parent_job_status(session, job_id=item.job_id)
    return item


def cancel_image_job_item(session: Session, *, item_id: int) -> ImageJobItem:
    item = require_image_job_item(session, item_id=item_id)
    require_cancellable_item(item)
    mark_item_cancelled(item)
    record_image_job_item_event(session, item=item, event_type="image_job_item.cancelled")
    aggregate_parent_job_status(session, job_id=item.job_id)
    return item


def retry_image_job(session: Session, *, job_id: int) -> dict[str, int]:
    require_image_job(session, job_id=job_id)
    items = list_retryable_items(session, job_id=job_id)
    for item in items:
        requeue_item(item)
        record_image_job_item_event(session, item=item, event_type="image_job_item.retry_scheduled")
    aggregate_parent_job_status(session, job_id=job_id)
    return {"job_id": job_id, "updated_items": len(items)}


def cancel_image_job(session: Session, *, job_id: int) -> dict[str, int]:
    job = require_image_job(session, job_id=job_id)
    previous_status = job.status
    items = list(session.execute(select(ImageJobItem).where(ImageJobItem.job_id == job_id)).scalars())
    cancellable = [item for item in items if item.status != "succeeded"]
    for item in cancellable:
        mark_item_cancelled(item)
        record_image_job_item_event(session, item=item, event_type="image_job_item.cancelled")
    job.status = "cancelled"
    job.error_code = None
    job.error_message = None
    job.finished_at = datetime.utcnow()
    record_image_job_status_event(session, job=job, previous_status=previous_status)
    return {"job_id": job_id, "updated_items": len(cancellable)}


def pause_provider_runtime(session: Session, *, provider_id: int) -> ProviderRuntimeState:
    require_provider(session, provider_id=provider_id)
    state = get_or_create_provider_runtime_state(session, provider_id=provider_id)
    state.status = "paused"
    state.updated_at = datetime.utcnow()
    return state


def resume_provider_runtime(session: Session, *, provider_id: int) -> ProviderRuntimeState:
    require_provider(session, provider_id=provider_id)
    state = get_or_create_provider_runtime_state(session, provider_id=provider_id)
    state.status = "healthy"
    state.failure_count = 0
    state.last_failure_at = None
    state.circuit_open_until = None
    state.updated_at = datetime.utcnow()
    return state


def update_job_priority(session: Session, *, job_id: int, priority: int) -> dict[str, int]:
    require_image_job(session, job_id=job_id)
    items = list(session.execute(select(ImageJobItem).where(ImageJobItem.job_id == job_id)).scalars())
    for item in items:
        item.priority = priority
    session.flush()
    return {"job_id": job_id, "priority": priority, "updated_items": len(items)}


def require_image_job_item(session: Session, *, item_id: int) -> ImageJobItem:
    item = session.get(ImageJobItem, item_id)
    if item is None:
        raise AppError(code="image_job_item_not_found", message="image job item not found", status_code=404)
    return item


def require_image_job(session: Session, *, job_id: int) -> ImageJob:
    job = session.get(ImageJob, job_id)
    if job is None:
        raise AppError(code="image_job_not_found", message="image job not found", status_code=404)
    return job


def require_provider(session: Session, *, provider_id: int) -> Provider:
    provider = session.get(Provider, provider_id)
    if provider is None:
        raise AppError(code="provider_not_found", message="provider not found", status_code=404)
    return provider


def require_retryable_item(item: ImageJobItem) -> None:
    if item.status in RETRYABLE_ADMIN_ITEM_STATUSES or item.dead_letter_at is not None:
        return
    raise AppError(code="image_job_item_not_retryable", message="image job item is not retryable", status_code=409)


def require_cancellable_item(item: ImageJobItem) -> None:
    if item.status in CANCELLABLE_ADMIN_ITEM_STATUSES:
        return
    raise AppError(code="image_job_item_not_cancellable", message="image job item is not cancellable", status_code=409)


def list_retryable_items(session: Session, *, job_id: int) -> list[ImageJobItem]:
    statement = (
        select(ImageJobItem)
        .where(ImageJobItem.job_id == job_id)
        .where((ImageJobItem.status.in_(RETRYABLE_ADMIN_ITEM_STATUSES)) | (ImageJobItem.dead_letter_at.is_not(None)))
    )
    return list(session.execute(statement).scalars())


def requeue_item(item: ImageJobItem) -> None:
    now = datetime.utcnow()
    item.status = "queued"
    item.dead_letter_at = None
    item.cancelled_at = None
    item.cancel_reason = None
    item.available_at = now
    item.finished_at = None
    item.error_code = None
    item.error_message = None
    item.manual_retry_count += 1
    clear_item_lock(item)


def mark_item_cancelled(item: ImageJobItem) -> None:
    now = datetime.utcnow()
    item.status = "cancelled"
    item.cancelled_at = now
    item.cancel_reason = ADMIN_CANCEL_REASON
    item.available_at = now
    item.finished_at = now
    item.error_code = None
    item.error_message = None
    clear_item_lock(item)


def get_or_create_provider_runtime_state(session: Session, *, provider_id: int) -> ProviderRuntimeState:
    state = session.get(ProviderRuntimeState, provider_id)
    if state is not None:
        return state
    state = ProviderRuntimeState(provider_id=provider_id)
    session.add(state)
    session.flush()
    return state
