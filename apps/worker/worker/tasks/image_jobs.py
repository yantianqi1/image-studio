from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import logging

from apps.api.app.domains.image.models import ImageJob
from apps.api.app.domains.image.service import claim_next_job, process_claimed_job
from apps.api.app.domains.image.title_generation import PENDING_IMAGE_JOB_TITLE, generate_image_job_title
from apps.api.app.infra.db.session import session_scope

logger = logging.getLogger(__name__)


def run_next_image_job() -> int | None:
    job_ids = run_next_image_jobs(max_workers=1)
    return job_ids[0] if job_ids else None


def run_next_image_jobs(*, max_workers: int | None = None) -> list[int]:
    job_ids = claim_image_job_ids(max_jobs=max_workers)
    if not job_ids:
        return []
    with ThreadPoolExecutor(max_workers=len(job_ids)) as executor:
        list(executor.map(process_claimed_image_job, job_ids))
    return job_ids


def claim_image_job_ids(*, max_jobs: int | None) -> list[int]:
    if max_jobs is not None:
        return claim_next_image_job_ids(max_jobs=max_jobs)
    return claim_all_available_image_job_ids()


def claim_all_available_image_job_ids() -> list[int]:
    job_ids: list[int] = []
    with session_scope() as session:
        while True:
            job = claim_next_job(session)
            if job is None:
                return job_ids
            job_ids.append(job.id)


def claim_next_image_job_ids(*, max_jobs: int) -> list[int]:
    if max_jobs < 1:
        raise ValueError("image job concurrency must be at least 1")
    job_ids: list[int] = []
    with session_scope() as session:
        for _ in range(max_jobs):
            job = claim_next_job(session)
            if job is None:
                break
            job_ids.append(job.id)
    return job_ids


def process_claimed_image_job(job_id: int) -> int:
    with ThreadPoolExecutor(max_workers=2) as executor:
        title_future = executor.submit(generate_requested_image_job_title, job_id)
        render_future = executor.submit(process_claimed_image_job_render, job_id)
        render_future.result()
        log_title_generation_failure(job_id=job_id, future=title_future)
    return job_id


def process_claimed_image_job_render(job_id: int) -> int:
    with session_scope() as session:
        process_claimed_job(session, job_id=job_id)
    return job_id


def generate_requested_image_job_title(job_id: int) -> int | None:
    with session_scope() as session:
        job = session.get(ImageJob, job_id)
        if not should_generate_image_job_title(job):
            return None
        job.title = generate_image_job_title(session, prompt=job.prompt)
        return job_id


def should_generate_image_job_title(job: ImageJob | None) -> bool:
    return bool(job and job.title == PENDING_IMAGE_JOB_TITLE)


def log_title_generation_failure(*, job_id: int, future) -> None:
    try:
        future.result()
    except Exception:
        logger.exception("image job title generation failed", extra={"image_job_id": job_id})
