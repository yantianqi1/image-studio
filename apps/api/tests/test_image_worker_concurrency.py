from __future__ import annotations

import threading
import time

from sqlalchemy import select

from apps.api.app.domains.image import service as image_service
from apps.api.app.domains.image.models import ImageJob
from apps.api.app.infra.db.session import session_scope
from apps.worker.worker import main as worker_main
from apps.api.tests.test_image_jobs import build_client, build_rendered_image, register_user


EXPECTED_UNLIMITED_JOB_COUNT = 4


def test_worker_run_once_processes_all_claimable_image_jobs_concurrently(monkeypatch) -> None:
    client = build_client()
    register_user(client, email="worker-concurrency@example.com")
    job_ids = [
        create_member_job(client, prompt=f"Concurrent image {index}")["id"]
        for index in range(1, EXPECTED_UNLIMITED_JOB_COUNT + 1)
    ]
    tracker = RenderConcurrencyTracker()
    monkeypatch.setattr(image_service, "render_image", tracker.render, raising=False)

    message = worker_main.run_once()

    assert message == f"Processed image jobs {', '.join(str(job_id) for job_id in job_ids)}."
    assert tracker.max_active == EXPECTED_UNLIMITED_JOB_COUNT
    with session_scope() as session:
        jobs = list(session.execute(select(ImageJob).where(ImageJob.id.in_(job_ids))).scalars())
        assert [job.status for job in sorted(jobs, key=lambda job: job.id)] == [
            "succeeded"
            for _ in range(EXPECTED_UNLIMITED_JOB_COUNT)
        ]


def test_worker_run_once_processes_image_jobs_when_comic_task_is_claimed(monkeypatch) -> None:
    calls: list[str] = []

    def process_comic_task() -> str:
        calls.append("comic-task")
        return "comic-task-1"

    def process_comic_orchestration() -> None:
        calls.append("comic-orchestration")
        return None

    def process_image_jobs() -> list[int]:
        calls.append("image-jobs")
        return [101, 102]

    monkeypatch.setattr(worker_main, "run_next_comic_task", process_comic_task)
    monkeypatch.setattr(worker_main, "run_next_comic_orchestration", process_comic_orchestration)
    monkeypatch.setattr(worker_main, "run_next_image_jobs", process_image_jobs)

    message = worker_main.run_once()

    assert sorted(calls) == ["comic-orchestration", "comic-task", "image-jobs"]
    assert message == "Processed comic task comic-task-1; Processed image jobs 101, 102."


def test_serve_forever_starts_independent_worker_branches(monkeypatch) -> None:
    submitted_branches: list[str] = []
    max_workers_seen: list[int] = []

    class CompletedFuture:
        def result(self) -> None:
            return None

    class CapturingExecutor:
        def __init__(self, *, max_workers: int) -> None:
            max_workers_seen.append(max_workers)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback) -> None:
            return None

        def submit(self, _fn, *, branch, poll_interval_seconds):
            assert poll_interval_seconds == 1.0
            submitted_branches.append(branch.name)
            return CompletedFuture()

    monkeypatch.setattr(worker_main, "ThreadPoolExecutor", CapturingExecutor)
    monkeypatch.setattr(worker_main, "wait_for_worker_branch_failure", lambda _futures: None)

    worker_main.serve_forever()

    assert max_workers_seen == [3]
    assert submitted_branches == ["comic-task", "comic-orchestration", "image-jobs"]


class RenderConcurrencyTracker:
    def __init__(self) -> None:
        self.active = 0
        self.max_active = 0
        self.lock = threading.Lock()

    def render(self, _session=None, **kwargs):
        with self.lock:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
        time.sleep(0.05)
        with self.lock:
            self.active -= 1
        return build_rendered_image(prompt=kwargs["prompt"], model_code=kwargs["model_code"])


def create_member_job(client, *, prompt: str) -> dict[str, object]:
    response = client.post(
        "/api/public/image/jobs",
        json={"prompt": prompt, "model_code": "gpt-image-2", "requested_count": 1},
    )
    assert response.status_code == 201
    return response.json()["data"]
