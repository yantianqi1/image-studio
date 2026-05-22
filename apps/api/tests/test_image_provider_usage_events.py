from __future__ import annotations

from sqlalchemy import select

from apps.api.app.domains.image import service as image_service
from apps.api.app.domains.image.models import ImageJob, ImageProviderUsageEvent
from apps.api.app.domains.llm.rendering import ProviderUsage, RenderedImage
from apps.api.app.infra.db.session import session_scope
from apps.api.tests.test_image_job_items import claim_one_item, create_member_image_job, process_item
from apps.api.tests.test_image_jobs import build_client, register_user


def test_item_completion_records_provider_usage_event_and_updates_job(monkeypatch) -> None:
    monkeypatch.setattr(image_service, "render_image", render_with_usage, raising=False)
    client = build_client()
    register_user(client, email="usage-event@example.com")
    job = create_member_image_job(client, requested_count=1)

    item_id = claim_one_item()
    process_item(item_id)

    with session_scope() as session:
        stored_job = session.get(ImageJob, job["id"])
        events = list(session.execute(select(ImageProviderUsageEvent)).scalars())

    assert len(events) == 1
    assert events[0].job_id == job["id"]
    assert events[0].item_id == item_id
    assert events[0].input_tokens == 11
    assert events[0].provider_model == "gpt-image-2"
    assert events[0].raw_payload == {"source": "unit"}
    assert stored_job.provider_input_tokens == 11
    assert stored_job.internal_cost_cents == 7


def render_with_usage(_session=None, **kwargs) -> RenderedImage:
    return RenderedImage(
        content=b"<svg></svg>",
        mime_type="image/svg+xml",
        revised_prompt=kwargs["prompt"],
        provider_request_id="usage-req-1",
        usage=ProviderUsage(
            input_tokens=11,
            output_tokens=13,
            total_tokens=24,
            raw_provider_cost_cents=5,
            provider_fee_cents=2,
            internal_cost_cents=7,
            raw_payload={"source": "unit"},
        ),
    )
