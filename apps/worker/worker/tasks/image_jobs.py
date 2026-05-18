from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from apps.api.app.domains.image.service import claim_next_job, process_claimed_job
from apps.api.app.infra.db.session import session_scope


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
    with session_scope() as session:
        process_claimed_job(session, job_id=job_id)
    return job_id
