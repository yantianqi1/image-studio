from __future__ import annotations

from sqlalchemy import inspect

from apps.api.app.infra.db.session import get_engine, initialize_database


def test_image_job_event_tables_are_created() -> None:
    initialize_database()
    inspector = inspect(get_engine())

    assert inspector.has_table("image_job_events")
    assert inspector.has_table("outbox_events")
    assert_image_job_events(inspector)
    assert_outbox_events(inspector)


def assert_image_job_events(inspector) -> None:
    columns = {column["name"] for column in inspector.get_columns("image_job_events")}
    assert {"id", "job_id", "item_id", "event_type", "payload", "created_at"} <= columns
    indexes = {index["name"] for index in inspector.get_indexes("image_job_events")}
    assert {"ix_image_job_events_job_id_id", "ix_image_job_events_event_type"} <= indexes


def assert_outbox_events(inspector) -> None:
    columns = {column["name"] for column in inspector.get_columns("outbox_events")}
    assert {
        "id",
        "aggregate_type",
        "aggregate_id",
        "event_type",
        "payload",
        "status",
        "attempts",
        "available_at",
        "created_at",
        "processed_at",
    } <= columns
    indexes = {index["name"] for index in inspector.get_indexes("outbox_events")}
    assert {"ix_outbox_events_status_available_at_id", "ix_outbox_events_aggregate"} <= indexes
