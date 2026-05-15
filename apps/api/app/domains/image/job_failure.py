from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from apps.api.app.domains.image.job_recovery import IMAGE_JOB_RETRY_ERROR_CODE
from apps.api.app.domains.image.models import ImageJob
from apps.api.app.domains.image.repository import mark_job_failed

NON_RETRYABLE_ERROR_CODES = frozenset({"provider_content_refused", "provider_api_key_missing", "provider_base_url_missing"})


def handle_job_failure(
    session: Session,
    *,
    job: ImageJob,
    exc: Exception,
    retry_delay_seconds: int,
) -> None:
    error_code = getattr(exc, "code", None)
    if error_code in NON_RETRYABLE_ERROR_CODES or job.attempt_count >= job.max_attempts:
        mark_job_failed(session, job=job, error_message=str(exc))
        return
    retry_at = datetime.utcnow() + timedelta(seconds=retry_delay_seconds)
    job.status = "queued"
    job.error_code = IMAGE_JOB_RETRY_ERROR_CODE
    job.error_message = str(exc)
    job.available_at = retry_at
    job.finished_at = None
    session.flush()
