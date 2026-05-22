from __future__ import annotations

import json
from datetime import datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.image.models import ImageJob, ImageJobItem
from apps.worker.worker.config import get_settings as get_worker_settings

STALE_IMAGE_JOBS_ALERT_CODE = "stale_image_jobs_detected"
WORKER_STATUS_DRAINING = "draining"
WORKER_STATUS_RUNNING = "running"
IMAGE_ITEM_QUEUE_STATUSES = ("queued", "running", "succeeded", "failed", "cancelled")
MAX_RUNNING_IMAGE_ITEMS = 100


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


def list_worker_nodes(session: Session) -> list[dict[str, object]]:
    rows = session.execute(
        text(
            """
            SELECT id, worker_name, hostname, version, status, mode, concurrency,
                   started_at, last_heartbeat_at, metadata
            FROM worker_nodes
            ORDER BY last_heartbeat_at DESC, id ASC
            """
        )
    ).mappings()
    return [serialize_worker_node(row) for row in rows]


def build_image_queue_summary(session: Session) -> dict[str, object]:
    generated_at = datetime.utcnow()
    status_rows = session.execute(
        select(ImageJobItem.status, func.count(ImageJobItem.id)).group_by(ImageJobItem.status)
    ).all()
    raw_counts = {status: int(count) for status, count in status_rows}
    counts = {status: raw_counts.get(status, 0) for status in IMAGE_ITEM_QUEUE_STATUSES}
    counts["dead_letter"] = count_dead_letter_items(session)
    return {
        "items": counts,
        "stale_running": count_stale_running_items(session, now=generated_at),
        "generated_at": generated_at.isoformat(),
    }


def count_dead_letter_items(session: Session) -> int:
    statement = select(func.count(ImageJobItem.id)).where(ImageJobItem.dead_letter_at.is_not(None))
    return int(session.execute(statement).scalar_one())


def count_stale_running_items(session: Session, *, now: datetime) -> int:
    statement = select(func.count(ImageJobItem.id)).where(
        ImageJobItem.status == "running",
        ImageJobItem.lease_expires_at.is_not(None),
        ImageJobItem.lease_expires_at <= now,
    )
    return int(session.execute(statement).scalar_one())


def list_running_image_items(session: Session) -> list[dict[str, object]]:
    statement = (
        select(ImageJobItem, ImageJob)
        .join(ImageJob, ImageJob.id == ImageJobItem.job_id)
        .where(ImageJobItem.status == "running")
        .order_by(ImageJobItem.started_at.asc(), ImageJobItem.id.asc())
        .limit(MAX_RUNNING_IMAGE_ITEMS)
    )
    return [serialize_running_image_item(item, job) for item, job in session.execute(statement).all()]


def drain_worker_node(session: Session, *, worker_id: str) -> dict[str, object]:
    return update_worker_status(session, worker_id=worker_id, status=WORKER_STATUS_DRAINING)


def resume_worker_node(session: Session, *, worker_id: str) -> dict[str, object]:
    return update_worker_status(session, worker_id=worker_id, status=WORKER_STATUS_RUNNING)


def update_worker_status(session: Session, *, worker_id: str, status: str) -> dict[str, object]:
    result = session.execute(
        text(
            """
            UPDATE worker_nodes
            SET status = :status, last_heartbeat_at = CURRENT_TIMESTAMP
            WHERE id = :worker_id
            """
        ),
        {"status": status, "worker_id": worker_id},
    )
    if result.rowcount == 0:
        raise AppError(code="worker_node_not_found", message="worker node not found", status_code=404)
    record_worker_ops_event(session, worker_id=worker_id, status=status)
    return get_worker_node(session, worker_id=worker_id)


def get_worker_node(session: Session, *, worker_id: str) -> dict[str, object]:
    row = session.execute(
        text(
            """
            SELECT id, worker_name, hostname, version, status, mode, concurrency,
                   started_at, last_heartbeat_at, metadata
            FROM worker_nodes
            WHERE id = :worker_id
            """
        ),
        {"worker_id": worker_id},
    ).mappings().first()
    if row is None:
        raise AppError(code="worker_node_not_found", message="worker node not found", status_code=404)
    return serialize_worker_node(row)


def record_worker_ops_event(session: Session, *, worker_id: str, status: str) -> None:
    session.execute(
        text(
            """
            INSERT INTO runtime_ops_events (event_type, target_type, target_id, payload, created_at)
            VALUES (:event_type, 'worker_node', :worker_id, :payload, CURRENT_TIMESTAMP)
            """
        ),
        {
            "event_type": f"worker.{status}",
            "worker_id": worker_id,
            "payload": json.dumps({"status": status}, separators=(",", ":")),
        },
    )


def serialize_worker_node(row) -> dict[str, object]:
    return {
        "id": row["id"],
        "worker_name": row["worker_name"],
        "hostname": row["hostname"],
        "version": row["version"],
        "status": row["status"],
        "mode": row["mode"],
        "concurrency": row["concurrency"],
        "started_at": isoformat(row["started_at"]),
        "last_heartbeat_at": isoformat(row["last_heartbeat_at"]),
        "metadata": parse_metadata(row["metadata"]),
    }


def serialize_running_image_item(item: ImageJobItem, job: ImageJob) -> dict[str, object]:
    return {
        "item_id": item.id,
        "job_id": item.job_id,
        "result_index": item.result_index,
        "model_code": job.model_code,
        "provider_id": job.provider_id,
        "locked_by": item.locked_by,
        "attempt_count": item.attempt_count,
        "max_attempts": item.max_attempts,
        "started_at": isoformat(item.started_at),
        "heartbeat_at": isoformat(item.heartbeat_at),
        "lease_expires_at": isoformat(item.lease_expires_at),
    }


def parse_metadata(value) -> dict[str, object]:
    if isinstance(value, dict):
        return value
    if value in (None, ""):
        return {}
    return json.loads(value)


def isoformat(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)
