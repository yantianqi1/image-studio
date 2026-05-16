from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.image.models import ImageJob

ANONYMOUS_IMAGE_JOB_SOURCE = "anonymous"
ANONYMOUS_IMAGE_JOB_ACTIVE_LIMIT = 2
ACTIVE_SUBMISSION_STATUSES = ("queued", "running")
RUNNING_JOB_STATUSES = ("running",)


def enforce_image_job_submission_limit(
    session: Session,
    *,
    owner: OwnerContext,
    source: str,
) -> None:
    if not is_limited_anonymous_source(source=source, anonymous_session_id=owner.anonymous_session_id):
        return
    active_count = count_anonymous_image_jobs(
        session,
        anonymous_session_id=owner.anonymous_session_id,
        statuses=ACTIVE_SUBMISSION_STATUSES,
    )
    if active_count < ANONYMOUS_IMAGE_JOB_ACTIVE_LIMIT:
        return
    raise AppError(
        code="anonymous_image_job_concurrency_limit",
        message="匿名生图任务最多 2 个同时处理中，请稍等前面的任务完成后再提交。",
        status_code=429,
    )


def can_claim_image_job(session: Session, *, job: ImageJob) -> bool:
    if not is_limited_anonymous_source(source=job.source, anonymous_session_id=job.anonymous_session_id):
        return True
    running_count = count_anonymous_image_jobs(
        session,
        anonymous_session_id=job.anonymous_session_id,
        statuses=RUNNING_JOB_STATUSES,
        exclude_job_id=job.id,
    )
    return running_count < ANONYMOUS_IMAGE_JOB_ACTIVE_LIMIT


def is_limited_anonymous_source(*, source: str, anonymous_session_id: int | None) -> bool:
    return source == ANONYMOUS_IMAGE_JOB_SOURCE and anonymous_session_id is not None


def count_anonymous_image_jobs(
    session: Session,
    *,
    anonymous_session_id: int | None,
    statuses: tuple[str, ...],
    exclude_job_id: int | None = None,
) -> int:
    if anonymous_session_id is None:
        return 0
    statement = select(func.count()).select_from(ImageJob).where(
        ImageJob.anonymous_session_id == anonymous_session_id,
        ImageJob.source == ANONYMOUS_IMAGE_JOB_SOURCE,
        ImageJob.status.in_(statuses),
    )
    if exclude_job_id is not None:
        statement = statement.where(ImageJob.id != exclude_job_id)
    return int(session.execute(statement).scalar_one())
