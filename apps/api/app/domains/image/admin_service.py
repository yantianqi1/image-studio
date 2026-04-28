from __future__ import annotations

from sqlalchemy.orm import Session

from apps.api.app.domains.image.models import ImageJob, ImageJobResult
from apps.api.app.domains.image.repository import list_jobs, list_results_for_jobs


def list_admin_jobs_with_results(session: Session) -> list[tuple[ImageJob, list[ImageJobResult]]]:
    jobs = list_jobs(session)
    results_by_job_id = list_results_for_jobs(session, [job.id for job in jobs])
    return [(job, results_by_job_id.get(job.id, [])) for job in jobs]
