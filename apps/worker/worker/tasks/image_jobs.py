from __future__ import annotations

"""Legacy Python image job executor.

Production image job execution is owned by apps/worker-go. This module remains
for tests, manual repair, and legacy rows without image_job_items. The worker
main branch is gated by WORKER_ENABLE_IMAGE_JOBS and defaults to disabled.
"""

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import logging

from sqlalchemy import select

from apps.api.app.domains.image.models import ImageJob
from apps.api.app.domains.image.models import ImageJobItem
from apps.api.app.domains.image.service import (
    claim_next_item_ids,
    claim_next_job,
    claim_next_job_ids,
    process_claimed_item,
    process_claimed_job,
)
from apps.api.app.domains.image.title_generation import PENDING_IMAGE_JOB_TITLE, generate_image_job_title
from apps.api.app.infra.db.session import session_scope
from apps.worker.worker.config import get_settings

logger = logging.getLogger(__name__)

WORK_KIND_ITEM = "item"
WORK_KIND_LEGACY_JOB = "legacy_job"


@dataclass(frozen=True)
class ClaimedImageWork:
    kind: str
    id: int
    job_id: int


def run_next_image_job() -> int | None:
    job_ids = run_next_image_jobs(max_workers=1)
    return job_ids[0] if job_ids else None


def run_next_image_jobs(*, max_workers: int | None = None) -> list[int]:
    work_items = claim_image_work(max_jobs=max_workers)
    if not work_items:
        return []
    with ThreadPoolExecutor(max_workers=len(work_items)) as executor:
        return list(executor.map(process_claimed_image_work, work_items))


def claim_image_work(*, max_jobs: int | None) -> list[ClaimedImageWork]:
    if max_jobs is not None:
        return claim_next_image_work(max_items=max_jobs)
    return claim_all_available_image_work()


def claim_all_available_image_work() -> list[ClaimedImageWork]:
    """Manual/test helper for intentionally draining every currently available image work item."""
    work_items: list[ClaimedImageWork] = []
    while True:
        claimed = claim_next_image_work(max_items=1)
        if not claimed:
            return work_items
        work_items.extend(claimed)


def claim_next_image_job_ids(*, max_jobs: int) -> list[int]:
    """Deprecated: only claims legacy image_jobs rows that have no image_job_items."""
    if max_jobs < 1:
        raise ValueError("max_jobs must be at least 1 for image job claiming")
    worker_name = get_settings().worker_name
    with session_scope() as session:
        return claim_next_job_ids(session, limit=max_jobs, worker_name=worker_name)


def claim_next_image_work(*, max_items: int) -> list[ClaimedImageWork]:
    if max_items < 1:
        raise ValueError("max_items must be at least 1 for image work claiming")
    worker_name = get_settings().worker_name
    with session_scope() as session:
        item_ids = claim_next_item_ids(session, limit=max_items, worker_name=worker_name)
        item_work = build_item_work(session, item_ids=item_ids)
        remaining = max_items - len(item_work)
        legacy_ids = claim_next_job_ids(session, limit=remaining, worker_name=worker_name) if remaining else []
        return [*item_work, *build_legacy_work(legacy_ids)]


def build_item_work(session, *, item_ids: list[int]) -> list[ClaimedImageWork]:
    if not item_ids:
        return []
    statement = select(ImageJobItem.id, ImageJobItem.job_id).where(ImageJobItem.id.in_(item_ids))
    rows = {item_id: job_id for item_id, job_id in session.execute(statement)}
    return [ClaimedImageWork(kind=WORK_KIND_ITEM, id=item_id, job_id=rows[item_id]) for item_id in item_ids]


def build_legacy_work(job_ids: list[int]) -> list[ClaimedImageWork]:
    return [ClaimedImageWork(kind=WORK_KIND_LEGACY_JOB, id=job_id, job_id=job_id) for job_id in job_ids]


def process_claimed_image_work(work: ClaimedImageWork) -> int:
    with ThreadPoolExecutor(max_workers=2) as executor:
        title_future = executor.submit(generate_requested_image_job_title, work.job_id)
        render_future = executor.submit(process_claimed_image_work_render, work)
        render_future.result()
        log_title_generation_failure(job_id=work.job_id, future=title_future)
    return work.job_id


def process_claimed_image_work_render(work: ClaimedImageWork) -> int:
    with session_scope() as session:
        if work.kind == WORK_KIND_ITEM:
            process_claimed_item(session, item_id=work.id)
            return work.job_id
        process_claimed_job(session, job_id=work.job_id)
    return work.job_id


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
