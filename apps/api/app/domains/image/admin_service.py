from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.image.models import ImageJob, ImageJobResult
from apps.api.app.domains.image.models import ImageJobItem
from apps.api.app.domains.image.job_items import aggregate_parent_job_status, clear_item_lock
from apps.api.app.domains.image.repository import list_jobs, list_results_for_jobs


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
    now = datetime.utcnow()
    item.status = "queued"
    item.dead_letter_at = None
    item.available_at = now
    item.finished_at = None
    item.error_code = None
    item.error_message = None
    item.manual_retry_count += 1
    clear_item_lock(item)
    aggregate_parent_job_status(session, job_id=item.job_id)
    return item


def update_job_priority(session: Session, *, job_id: int, priority: int) -> dict[str, int]:
    job = session.get(ImageJob, job_id)
    if job is None:
        raise AppError(code="image_job_not_found", message="image job not found", status_code=404)
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
