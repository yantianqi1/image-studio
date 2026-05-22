from __future__ import annotations

from sqlalchemy.orm import Session

from apps.api.app.domains.image.models import Asset, ImageJob, ImageJobEvent, ImageJobItem, OutboxEvent

IMAGE_JOB_AGGREGATE_TYPE = "image_job"
ASSET_AGGREGATE_TYPE = "asset"
JOB_STATUS_EVENTS = {
    "running": "image_job.started",
    "succeeded": "image_job.succeeded",
    "failed": "image_job.failed",
    "cancelled": "image_job.cancelled",
}


def record_image_job_event(
    session: Session,
    *,
    job_id: int,
    event_type: str,
    payload: dict[str, object],
    item_id: int | None = None,
) -> ImageJobEvent:
    stored_payload = dict(payload)
    event = ImageJobEvent(job_id=job_id, item_id=item_id, event_type=event_type, payload=stored_payload)
    session.add(event)
    session.add(OutboxEvent(
        aggregate_type=IMAGE_JOB_AGGREGATE_TYPE,
        aggregate_id=str(job_id),
        event_type=event_type,
        payload=dict(stored_payload),
    ))
    session.flush()
    return event


def record_image_job_item_event(session: Session, *, item: ImageJobItem, event_type: str) -> ImageJobEvent:
    return record_image_job_event(
        session,
        job_id=item.job_id,
        item_id=item.id,
        event_type=event_type,
        payload={"id": item.job_id, "status": item.status, "item_id": item.id},
    )


def record_image_job_status_event(
    session: Session,
    *,
    job: ImageJob,
    previous_status: str,
) -> ImageJobEvent | None:
    if job.status == previous_status or job.status == "queued":
        return None
    event_type = JOB_STATUS_EVENTS.get(job.status)
    if event_type is None:
        raise ValueError(f"unsupported image job status event: {job.status}")
    return record_image_job_event(
        session,
        job_id=job.id,
        event_type=event_type,
        payload={"id": job.id, "status": job.status},
    )


def record_asset_created_event(session: Session, *, asset: Asset) -> OutboxEvent:
    payload = {
        "asset_id": asset.id,
        "storage_path": asset.storage_path,
        "size_bytes": asset.size_bytes,
        "sha256": asset.sha256,
        "width": asset.width,
        "height": asset.height,
        "storage_backend": asset.storage_backend,
    }
    event = OutboxEvent(
        aggregate_type=ASSET_AGGREGATE_TYPE,
        aggregate_id=str(asset.id),
        event_type="asset.created",
        payload=payload,
    )
    session.add(event)
    session.flush()
    return event
