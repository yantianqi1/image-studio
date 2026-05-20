from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from apps.api.app.domains.image.models import ImageJob
from apps.api.app.domains.image.repository import clear_job_lock, mark_job_failed

IMAGE_JOB_RETRY_ERROR_CODE = "image_job_retry_scheduled"


def recover_stale_running_jobs(session: Session, *, stale_timeout_seconds: int) -> None:
    current_time = datetime.utcnow()
    stale_before = current_time - timedelta(seconds=stale_timeout_seconds)
    jobs = list(
        session.execute(
            select(ImageJob).where(*build_stale_running_job_conditions(current_time, stale_before))
        ).scalars()
    )
    for job in jobs:
        recover_stale_job(session, job=job)
    session.flush()


def build_stale_running_job_conditions(current_time: datetime, stale_before: datetime):
    return (
        ImageJob.status == "running",
        or_(
            and_(ImageJob.lease_expires_at.is_not(None), ImageJob.lease_expires_at <= current_time),
            and_(
                ImageJob.lease_expires_at.is_(None),
                ImageJob.started_at.is_not(None),
                ImageJob.started_at <= stale_before,
            ),
        ),
    )


def recover_stale_job(session: Session, *, job: ImageJob) -> None:
    if job.attempt_count >= job.max_attempts:
        mark_job_failed(session, job=job, error_message="stale running image job expired")
        return
    job.status = "queued"
    job.error_code = IMAGE_JOB_RETRY_ERROR_CODE
    job.error_message = "stale running image job requeued"
    job.available_at = datetime.utcnow()
    job.finished_at = None
    clear_job_lock(job)
