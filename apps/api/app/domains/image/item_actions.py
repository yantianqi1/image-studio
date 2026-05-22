from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.image.events import record_image_job_item_event
from apps.api.app.domains.image.job_items import aggregate_parent_job_status, clear_item_lock
from apps.api.app.domains.image.models import ImageJob, ImageJobItem

USER_CANCEL_REASON = "user_cancelled"
RETRYABLE_PUBLIC_ITEM_STATUSES = {"failed"}
CANCELLABLE_PUBLIC_ITEM_STATUSES = {"queued", "running", "failed"}


def retry_public_image_job_item(
    session: Session,
    *,
    item_id: int,
    owner: OwnerContext,
) -> ImageJobItem:
    item = get_public_job_item(session, item_id=item_id, owner=owner)
    if item.status not in RETRYABLE_PUBLIC_ITEM_STATUSES and item.dead_letter_at is None:
        raise AppError(code="image_job_item_not_retryable", message="image job item is not retryable", status_code=409)
    requeue_public_item(item)
    record_image_job_item_event(session, item=item, event_type="image_job_item.retry_scheduled")
    aggregate_parent_job_status(session, job_id=item.job_id)
    return item


def cancel_public_image_job_item(
    session: Session,
    *,
    item_id: int,
    owner: OwnerContext,
) -> ImageJobItem:
    item = get_public_job_item(session, item_id=item_id, owner=owner)
    if item.status not in CANCELLABLE_PUBLIC_ITEM_STATUSES:
        raise AppError(code="image_job_item_not_cancellable", message="image job item is not cancellable", status_code=409)
    mark_public_item_cancelled(item)
    record_image_job_item_event(session, item=item, event_type="image_job_item.cancelled")
    aggregate_parent_job_status(session, job_id=item.job_id)
    return item


def list_public_image_job_items(
    session: Session,
    *,
    job_id: int,
    owner: OwnerContext,
) -> list[ImageJobItem]:
    statement = select(ImageJobItem).join(ImageJob, ImageJob.id == ImageJobItem.job_id)
    statement = statement.where(ImageJob.id == job_id, public_owner_filter(owner))
    return list(session.execute(statement.order_by(ImageJobItem.result_index.asc())).scalars())


def get_public_job_item(session: Session, *, item_id: int, owner: OwnerContext) -> ImageJobItem:
    statement = select(ImageJobItem).join(ImageJob, ImageJob.id == ImageJobItem.job_id)
    statement = statement.where(ImageJobItem.id == item_id, public_owner_filter(owner))
    item = session.execute(statement).scalar_one_or_none()
    if item is None:
        raise AppError(code="image_job_item_not_found", message="image job item not found", status_code=404)
    return item


def public_owner_filter(owner: OwnerContext):
    if owner.user_id is not None:
        return ImageJob.user_id == owner.user_id
    if owner.anonymous_session_id is not None:
        return ImageJob.anonymous_session_id == owner.anonymous_session_id
    return ImageJob.id.is_(None)


def requeue_public_item(item: ImageJobItem) -> None:
    now = datetime.utcnow()
    item.status = "queued"
    item.dead_letter_at = None
    item.cancelled_at = None
    item.cancel_reason = None
    item.available_at = now
    item.finished_at = None
    item.error_code = None
    item.error_message = None
    item.manual_retry_count += 1
    clear_item_lock(item)


def mark_public_item_cancelled(item: ImageJobItem) -> None:
    now = datetime.utcnow()
    item.status = "cancelled"
    item.cancelled_at = now
    item.cancel_reason = USER_CANCEL_REASON
    item.available_at = now
    item.finished_at = now
    item.error_code = None
    item.error_message = None
    clear_item_lock(item)
