from __future__ import annotations

import threading
import time

from sqlalchemy import select

from apps.api.app.domains.image import service as image_service
from apps.api.app.domains.image.models import ImageJob
from apps.api.app.infra.db.session import session_scope
from apps.worker.worker import main as worker_main
from apps.api.tests.test_image_jobs import build_client, build_rendered_image, create_image_job


def test_worker_run_once_processes_three_image_jobs_concurrently(monkeypatch) -> None:
    client = build_client()
    job_ids = [create_image_job(client, prompt=f"Concurrent image {index}")["id"] for index in range(1, 4)]
    tracker = RenderConcurrencyTracker()
    monkeypatch.setattr(image_service, "render_image", tracker.render, raising=False)

    message = worker_main.run_once()

    assert message == f"Processed image jobs {job_ids[0]}, {job_ids[1]}, {job_ids[2]}."
    assert tracker.max_active == 3
    with session_scope() as session:
        jobs = list(session.execute(select(ImageJob).where(ImageJob.id.in_(job_ids))).scalars())
        assert [job.status for job in sorted(jobs, key=lambda job: job.id)] == ["succeeded", "succeeded", "succeeded"]


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
