from __future__ import annotations

from sqlalchemy import delete, select

from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.image import service as image_service
from apps.api.app.domains.image.models import ImageJob, ImageJobItem
from apps.api.app.infra.db.session import session_scope
from apps.api.tests.test_image_jobs import (
    build_client,
    build_rendered_image_from_job,
    client_provider_headers,
    create_anonymous_owner,
    fake_client_provider_render,
    register_user,
)
from apps.worker.worker.tasks import image_jobs as worker_image_jobs


def post_image_job(client, *, prompt: str, headers: dict[str, str] | None = None):
    return client.post(
        "/api/public/image/jobs",
        headers=headers or {},
        json={"prompt": prompt, "model_code": "gpt-image-2", "requested_count": 1},
    )


def test_anonymous_image_jobs_are_not_limited_by_active_jobs(monkeypatch) -> None:
    monkeypatch.setattr(image_service, "render_image", build_rendered_image_from_job)
    client = build_client()

    responses = [
        post_image_job(client, prompt=f"Anonymous active job {index}")
        for index in range(1, 5)
    ]

    assert [response.status_code for response in responses] == [201, 201, 201, 201]


def test_client_provider_image_jobs_are_not_limited_by_anonymous_active_jobs(monkeypatch) -> None:
    monkeypatch.setattr(image_service, "render_with_client_provider", fake_client_provider_render)
    client = build_client()

    responses = [
        post_image_job(client, prompt=f"Client provider job {index}", headers=client_provider_headers())
        for index in range(1, 4)
    ]

    assert [response.status_code for response in responses] == [201, 201, 201]


def test_member_image_jobs_are_not_limited_by_anonymous_active_jobs(monkeypatch) -> None:
    monkeypatch.setattr(image_service, "render_image", build_rendered_image_from_job)
    client = build_client()
    register_user(client, email="image-concurrency@example.com")

    responses = [
        post_image_job(client, prompt=f"Member job {index}")
        for index in range(1, 4)
    ]

    assert [response.status_code for response in responses] == [201, 201, 201]


def test_worker_claims_all_requested_jobs_for_anonymous_session() -> None:
    build_client()
    with session_scope() as session:
        owner = create_anonymous_owner(session)
        job_ids = [
            create_legacy_anonymous_job(session, owner=owner, prompt=f"Legacy anonymous job {index}")
            for index in range(1, 4)
        ]
        session.execute(delete(ImageJobItem).where(ImageJobItem.job_id.in_(job_ids)))

    claimed_ids = worker_image_jobs.claim_next_image_job_ids(max_jobs=3)

    assert claimed_ids == job_ids
    with session_scope() as session:
        jobs = list(session.execute(select(ImageJob).where(ImageJob.id.in_(job_ids))).scalars())
    statuses = [job.status for job in sorted(jobs, key=lambda item: item.id)]
    assert statuses == ["running", "running", "running"]


def create_legacy_anonymous_job(session, *, owner: OwnerContext, prompt: str) -> int:
    job = image_service.create_job(
        session,
        owner=owner,
        source="anonymous",
        prompt=prompt,
        model_code="gpt-image-2",
        requested_count=1,
        mode="generate",
    )
    return job.id
