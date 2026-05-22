from __future__ import annotations

from datetime import datetime

from apps.api.app.domains.image.models import OutboxEvent
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.infra.outbox import (
    claim_pending_outbox_events,
    mark_outbox_event_failed,
    mark_outbox_event_processed,
)


def test_outbox_events_can_be_claimed_and_marked_processed() -> None:
    initialize_database()
    with session_scope() as session:
        event = OutboxEvent(
            aggregate_type="image_job",
            aggregate_id="12",
            event_type="image_job.created",
            payload={"id": 12},
        )
        session.add(event)
        session.flush()
        event_id = event.id

    with session_scope() as session:
        claimed = claim_pending_outbox_events(session, limit=1)
        mark_outbox_event_processed(session, event_id=claimed[0].id)

    with session_scope() as session:
        stored = session.get(OutboxEvent, event_id)

    assert [event.id for event in claimed] == [event_id]
    assert stored.status == "processed"
    assert stored.processed_at is not None


def test_failed_outbox_event_is_retried_after_delay() -> None:
    initialize_database()
    with session_scope() as session:
        event = OutboxEvent(
            aggregate_type="image_job",
            aggregate_id="12",
            event_type="image_job.created",
            payload={"id": 12},
        )
        session.add(event)
        session.flush()
        event_id = event.id

    with session_scope() as session:
        before = datetime.utcnow()
        mark_outbox_event_failed(session, event_id=event_id, retry_delay_seconds=30)

    with session_scope() as session:
        stored = session.get(OutboxEvent, event_id)

    assert stored.status == "pending"
    assert stored.attempts == 1
    assert stored.available_at > before
    assert stored.processed_at is None
