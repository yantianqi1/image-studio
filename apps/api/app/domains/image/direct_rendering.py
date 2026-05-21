from __future__ import annotations

"""Development/test-only synchronous image rendering path.

Public image job creation must enqueue image_job_items and return queued status.
Production rendering is owned by apps/worker-go.
"""

from datetime import datetime

from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.image.models import ImageJob
from apps.api.app.domains.image.repository import clear_job_outputs, complete_job, mark_job_failed
from apps.api.app.domains.image.service import process_render_results

ATTEMPT_INCREMENT = 1


def render_job_immediately(session: Session, *, job: ImageJob) -> ImageJob:
    mark_job_running(job)
    clear_job_outputs(session, job_id=job.id)
    try:
        process_render_results(session, job=job)
    except AppError as exc:
        mark_direct_job_failed(session, job=job, exc=exc)
        raise
    except Exception as exc:
        mark_direct_job_failed(session, job=job, exc=exc)
        raise AppError(code="image_job_render_failed", message=str(exc), status_code=502) from exc
    complete_job(session, job=job)
    session.flush()
    return job


def mark_job_running(job: ImageJob) -> None:
    started_at = datetime.utcnow()
    job.status = "running"
    job.attempt_count += ATTEMPT_INCREMENT
    job.started_at = started_at
    job.finished_at = None
    job.error_code = None
    job.error_message = None


def mark_direct_job_failed(session: Session, *, job: ImageJob, exc: Exception) -> None:
    clear_job_outputs(session, job_id=job.id)
    mark_job_failed(session, job=job, error_message=str(exc))
