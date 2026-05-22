from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.image.models import OutboxEvent

OUTBOX_STATUS_PENDING = "pending"
OUTBOX_STATUS_PROCESSING = "processing"
OUTBOX_STATUS_PROCESSED = "processed"


def claim_pending_outbox_events(session: Session, *, limit: int) -> list[OutboxEvent]:
    if limit < 1:
        raise ValueError("limit must be positive")
    now = datetime.utcnow()
    statement = (
        select(OutboxEvent)
        .where(OutboxEvent.status == OUTBOX_STATUS_PENDING, OutboxEvent.available_at <= now)
        .order_by(OutboxEvent.available_at.asc(), OutboxEvent.id.asc())
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    events = list(session.execute(statement).scalars())
    for event in events:
        event.status = OUTBOX_STATUS_PROCESSING
    session.flush()
    return events


def mark_outbox_event_processed(session: Session, *, event_id: int) -> OutboxEvent:
    event = require_outbox_event(session, event_id=event_id)
    event.status = OUTBOX_STATUS_PROCESSED
    event.processed_at = datetime.utcnow()
    session.flush()
    return event


def mark_outbox_event_failed(session: Session, *, event_id: int, retry_delay_seconds: int) -> OutboxEvent:
    if retry_delay_seconds < 0:
        raise ValueError("retry_delay_seconds must be non-negative")
    event = require_outbox_event(session, event_id=event_id)
    event.status = OUTBOX_STATUS_PENDING
    event.attempts += 1
    event.available_at = datetime.utcnow() + timedelta(seconds=retry_delay_seconds)
    event.processed_at = None
    session.flush()
    return event


def require_outbox_event(session: Session, *, event_id: int) -> OutboxEvent:
    event = session.get(OutboxEvent, event_id)
    if event is None:
        raise ValueError("outbox event not found")
    return event
