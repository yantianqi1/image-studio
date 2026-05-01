from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.image.models import ImageJob
from apps.api.app.domains.image.repository import mark_job_failed

IMAGE_JOB_RETRY_ERROR_CODE = "image_job_retry_scheduled"


def recover_stale_running_jobs(session: Session, *, stale_timeout_seconds: int) -> None:
    stale_before = datetime.utcnow() - timedelta(seconds=stale_timeout_seconds)
    jobs = list(
        session.execute(
            select(ImageJob).where(
                ImageJob.status == "running",
                ImageJob.started_at.is_not(None),
                ImageJob.started_at <= stale_before,
            )
        ).scalars()
    )
    for job in jobs:
        recover_stale_job(session, job=job)
    session.flush()


def recover_stale_job(session: Session, *, job: ImageJob) -> None:
    if job.attempt_count >= job.max_attempts:
        mark_job_failed(session, job=job, error_message="stale running image job expired")
        return
    job.status = "queued"
    job.error_code = IMAGE_JOB_RETRY_ERROR_CODE
    job.error_message = "stale running image job requeued"
    job.available_at = datetime.utcnow()
    job.finished_at = None
