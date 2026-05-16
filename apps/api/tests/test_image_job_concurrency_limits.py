from __future__ import annotations

from sqlalchemy import select

from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.image import service as image_service
from apps.api.app.domains.image.models import ImageJob
from apps.api.app.infra.db.session import session_scope
from apps.api.tests.test_image_jobs import build_client, client_provider_headers, create_anonymous_owner, register_user
from apps.worker.worker.tasks import image_jobs as worker_image_jobs


def post_image_job(client, *, prompt: str, headers: dict[str, str] | None = None):
    return client.post(
        "/api/public/image/jobs",
        headers=headers or {},
        json={"prompt": prompt, "model_code": "gpt-image-2", "requested_count": 1},
    )


def test_anonymous_image_jobs_accept_two_active_jobs_and_reject_third() -> None:
    client = build_client()

    first = post_image_job(client, prompt="Anonymous active job 1")
    second = post_image_job(client, prompt="Anonymous active job 2")
    third = post_image_job(client, prompt="Anonymous active job 3")

    assert first.status_code == 201
    assert second.status_code == 201
    assert third.status_code == 429
    assert third.json()["error"]["code"] == "anonymous_image_job_concurrency_limit"
    assert "最多 2 个" in third.json()["error"]["message"]


def test_client_provider_image_jobs_are_not_limited_by_anonymous_active_jobs() -> None:
    client = build_client()

    responses = [
        post_image_job(client, prompt=f"Client provider job {index}", headers=client_provider_headers())
        for index in range(1, 4)
    ]

    assert [response.status_code for response in responses] == [201, 201, 201]


def test_member_image_jobs_are_not_limited_by_anonymous_active_jobs(monkeypatch) -> None:
    monkeypatch.setenv("SIGNUP_BONUS_CENTS", "1000")
    client = build_client()
    register_user(client, email="image-concurrency@example.com")

    responses = [
        post_image_job(client, prompt=f"Member job {index}")
        for index in range(1, 4)
    ]

    assert [response.status_code for response in responses] == [201, 201, 201]


def test_worker_claims_at_most_two_running_jobs_per_anonymous_session() -> None:
    build_client()
    with session_scope() as session:
        owner = create_anonymous_owner(session)
        job_ids = [
            create_legacy_anonymous_job(session, owner=owner, prompt=f"Legacy anonymous job {index}")
            for index in range(1, 4)
        ]

    claimed_ids = worker_image_jobs.claim_next_image_job_ids(max_jobs=3)

    assert claimed_ids == job_ids[:2]
    with session_scope() as session:
        jobs = list(session.execute(select(ImageJob).where(ImageJob.id.in_(job_ids))).scalars())
    statuses = [job.status for job in sorted(jobs, key=lambda item: item.id)]
    assert statuses == ["running", "running", "queued"]


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
