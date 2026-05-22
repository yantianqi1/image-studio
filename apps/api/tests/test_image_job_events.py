from __future__ import annotations

from sqlalchemy import select

from apps.api.app.domains.image.models import ImageJobEvent, OutboxEvent
from apps.api.app.infra.db.session import session_scope
from apps.api.tests.test_image_job_items import claim_one_item, process_item
from apps.api.tests.test_image_jobs import build_rendered_image_from_job
from apps.api.tests.test_image_jobs import build_client, register_user
from apps.api.app.domains.image import service as image_service


def test_public_image_job_create_records_job_created_event() -> None:
    client = build_client()
    register_user(client, email="event-create@example.com")

    response = client.post(
        "/api/public/image/jobs",
        json={"prompt": "Event sourced image", "model_code": "gpt-image-2", "requested_count": 1},
    )

    assert response.status_code == 201
    job_id = response.json()["data"]["id"]
    with session_scope() as session:
        event = session.execute(select(ImageJobEvent).where(ImageJobEvent.job_id == job_id)).scalar_one()
        outbox = session.execute(select(OutboxEvent).where(OutboxEvent.aggregate_id == str(job_id))).scalar_one()

    assert event.event_type == "image_job.created"
    assert event.payload == {"id": job_id, "status": "queued"}
    assert outbox.event_type == event.event_type
    assert outbox.payload == event.payload


def test_item_processing_records_state_change_events(monkeypatch) -> None:
    monkeypatch.setattr(image_service, "render_image", build_rendered_image_from_job, raising=False)
    client = build_client()
    register_user(client, email="event-success@example.com")
    response = client.post(
        "/api/public/image/jobs",
        json={"prompt": "Event success image", "model_code": "gpt-image-2", "requested_count": 1},
    )
    assert response.status_code == 201
    job_id = response.json()["data"]["id"]

    process_item(claim_one_item())

    with session_scope() as session:
        event_types = list(
            session.execute(
                select(ImageJobEvent.event_type)
                .where(ImageJobEvent.job_id == job_id)
                .order_by(ImageJobEvent.id.asc())
            ).scalars()
        )
        outbox_types = list(
            session.execute(
                select(OutboxEvent.event_type)
                .where(OutboxEvent.aggregate_type == "image_job", OutboxEvent.aggregate_id == str(job_id))
                .order_by(OutboxEvent.id.asc())
            ).scalars()
        )

    assert event_types == [
        "image_job.created",
        "image_job_item.started",
        "image_job.started",
        "image_job_item.succeeded",
        "image_job.succeeded",
    ]
    assert outbox_types == event_types
