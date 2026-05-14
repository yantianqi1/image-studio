from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.domains.image.models import ImageJob, ImageJobResult
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
