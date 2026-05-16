from __future__ import annotations

from apps.api.app.domains.image.tagging import claim_next_gallery_tagging_job, process_claimed_gallery_tagging_job
from apps.api.app.infra.db.session import session_scope


def run_next_gallery_tagging_job() -> int | None:
    with session_scope() as session:
        job = claim_next_gallery_tagging_job(session)
        if job is None:
            return None
        job_id = job.id
    with session_scope() as session:
        process_claimed_gallery_tagging_job(session, job_id=job_id)
    return job_id
