from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.domains.image.models import ImageJob
from apps.worker.worker.config import get_settings as get_worker_settings

STALE_IMAGE_JOBS_ALERT_CODE = "stale_image_jobs_detected"


def build_worker_summary(session: Session) -> dict[str, object]:
    settings = get_worker_settings()
    stale_count = count_stale_running_jobs(
        session,
        stale_after_seconds=settings.worker_stale_running_job_seconds,
    )
    return {
        "image_jobs": build_image_job_summary(
            session,
            stale_count=stale_count,
            stale_after_seconds=settings.worker_stale_running_job_seconds,
        ),
        "alerts": build_stale_job_alerts(
            stale_count=stale_count,
            threshold=settings.worker_stale_job_alert_threshold,
        ),
    }


def build_image_job_summary(
    session: Session,
    *,
    stale_count: int,
    stale_after_seconds: int,
) -> dict[str, int]:
    statement = select(
        func.count(ImageJob.id).filter(ImageJob.status == "queued"),
        func.count(ImageJob.id).filter(ImageJob.status == "running"),
        func.count(ImageJob.id).filter(ImageJob.status == "succeeded"),
        func.count(ImageJob.id).filter(ImageJob.status == "failed"),
    )
    row = session.execute(statement).one()
    return {
        "queued": int(row[0]),
        "running": int(row[1]),
        "succeeded": int(row[2]),
        "failed": int(row[3]),
        "stale_running": stale_count,
        "stale_after_seconds": stale_after_seconds,
    }


def count_stale_running_jobs(session: Session, *, stale_after_seconds: int) -> int:
    stale_before = datetime.utcnow() - timedelta(seconds=stale_after_seconds)
    statement = select(func.count(ImageJob.id)).where(
        ImageJob.status == "running",
        ImageJob.started_at.is_not(None),
        ImageJob.started_at <= stale_before,
    )
    return int(session.execute(statement).scalar_one())


def build_stale_job_alerts(*, stale_count: int, threshold: int) -> list[dict[str, object]]:
    if stale_count < threshold:
        return []
    return [
        {
            "code": STALE_IMAGE_JOBS_ALERT_CODE,
            "level": "warning",
            "message": f"{stale_count} stale image jobs detected",
            "count": stale_count,
            "threshold": threshold,
        }
    ]
