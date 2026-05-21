from __future__ import annotations

from sqlalchemy import select

from apps.api.app.domains.image import service as image_service
from apps.api.app.domains.image.models import ImageJob, ImageJobResult
from apps.api.app.infra.db.session import session_scope
from apps.api.tests.test_image_jobs import build_client, build_rendered_image_from_job, register_user


def image_job_item_model():
    from apps.api.app.domains.image import models

    item_model = getattr(models, "ImageJobItem", None)
    assert item_model is not None
    return item_model


def create_member_image_job(client, *, requested_count: int = 3) -> dict[str, object]:
    response = client.post(
        "/api/public/image/jobs",
        json={
            "prompt": "Split this render into fair item work",
            "model_code": "gpt-image-2",
            "requested_count": requested_count,
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


def claim_one_item() -> int:
    with session_scope() as session:
        item_ids = image_service.claim_next_item_ids(session, limit=1, worker_name="item-worker")
    assert len(item_ids) == 1
    return item_ids[0]


def process_item(item_id: int) -> None:
    with session_scope() as session:
        image_service.process_claimed_item(session, item_id=item_id)


def test_requested_count_creates_one_item_per_result_index() -> None:
    item_model = image_job_item_model()
    client = build_client()
    register_user(client, email="items-create@example.com")
    job = create_member_image_job(client, requested_count=3)

    with session_scope() as session:
        items = list(
            session.execute(
                select(item_model)
                .where(item_model.job_id == job["id"])
                .order_by(item_model.result_index.asc())
            ).scalars()
        )
        stored_job = session.get(ImageJob, job["id"])

    assert [item.result_index for item in items] == [1, 2, 3]
    assert [item.status for item in items] == ["queued", "queued", "queued"]
    assert [item.max_attempts for item in items] == [3, 3, 3]
    assert stored_job.status == "queued"


def test_item_success_creates_result_and_parent_succeeds_after_all_items(monkeypatch) -> None:
    item_model = image_job_item_model()
    monkeypatch.setattr(image_service, "render_image", build_rendered_image_from_job, raising=False)
    client = build_client()
    register_user(client, email="items-success@example.com")
    job = create_member_image_job(client, requested_count=2)

    first_item_id = claim_one_item()
    process_item(first_item_id)

    with session_scope() as session:
        first_item = session.get(item_model, first_item_id)
        first_results = list(session.execute(select(ImageJobResult)).scalars())
        mid_job = session.get(ImageJob, job["id"])

    assert first_item.status == "succeeded"
    assert first_item.asset_id == first_results[0].asset_id
    assert [result.result_index for result in first_results] == [1]
    assert mid_job.status != "succeeded"

    second_item_id = claim_one_item()
    process_item(second_item_id)

    with session_scope() as session:
        final_job = session.get(ImageJob, job["id"])
        results = list(
            session.execute(
                select(ImageJobResult)
                .where(ImageJobResult.job_id == job["id"])
                .order_by(ImageJobResult.result_index.asc())
            ).scalars()
        )

    assert final_job.status == "succeeded"
    assert [result.result_index for result in results] == [1, 2]


def test_retryable_item_failure_does_not_fail_parent_job(monkeypatch) -> None:
    item_model = image_job_item_model()
    client = build_client()
    register_user(client, email="items-retry@example.com")
    job = create_member_image_job(client, requested_count=2)

    def failing_renderer(_session=None, **_kwargs):
        raise RuntimeError("temporary provider outage")

    monkeypatch.setattr(image_service, "IMAGE_JOB_RETRY_DELAY_SECONDS", 0, raising=False)
    monkeypatch.setattr(image_service, "render_image", failing_renderer, raising=False)

    item_id = claim_one_item()
    process_item(item_id)

    with session_scope() as session:
        item = session.get(item_model, item_id)
        parent = session.get(ImageJob, job["id"])
        results = list(session.execute(select(ImageJobResult)).scalars())

    assert item.status == "queued"
    assert item.attempt_count == 1
    assert item.error_code == "image_job_retry_scheduled"
    assert parent.status != "failed"
    assert results == []


def test_repeated_item_claims_do_not_claim_the_same_item_twice() -> None:
    item_model = image_job_item_model()
    client = build_client()
    register_user(client, email="items-claim@example.com")
    job = create_member_image_job(client, requested_count=3)

    with session_scope() as session:
        first_claim = image_service.claim_next_item_ids(session, limit=2, worker_name="worker-a")
    with session_scope() as session:
        second_claim = image_service.claim_next_item_ids(session, limit=2, worker_name="worker-b")
        items = list(session.execute(select(item_model).where(item_model.job_id == job["id"])).scalars())

    assert len(first_claim) == 2
    assert len(second_claim) == 1
    assert set(first_claim).isdisjoint(second_claim)
    assert sorted(item.status for item in items) == ["running", "running", "running"]


def test_item_claim_prioritizes_high_priority_and_skips_dead_letter() -> None:
    item_model = image_job_item_model()
    client = build_client()
    register_user(client, email="items-priority@example.com")
    job = create_member_image_job(client, requested_count=3)

    with session_scope() as session:
        items = list(
            session.execute(
                select(item_model)
                .where(item_model.job_id == job["id"])
                .order_by(item_model.result_index.asc())
            ).scalars()
        )
        items[0].priority = 1
        items[1].priority = 9
        items[2].priority = 20
        items[2].dead_letter_at = items[2].available_at
        session.flush()

    with session_scope() as session:
        claimed_ids = image_service.claim_next_item_ids(session, limit=2, worker_name="priority-worker")

    assert claimed_ids == [items[1].id, items[0].id]
