from __future__ import annotations

from apps.api.app.domains.image.service import claim_next_job, process_claimed_job
from apps.api.app.infra.db.session import session_scope


def run_next_image_job() -> int | None:
    with session_scope() as session:
        job = claim_next_job(session)
        if job is None:
            return None
        job_id = job.id
    with session_scope() as session:
        process_claimed_job(session, job_id=job_id)
    return job_id
