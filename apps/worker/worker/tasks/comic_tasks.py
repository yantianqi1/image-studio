from __future__ import annotations

from apps.api.app.domains.comic.repository import claim_next_task
from apps.api.app.domains.comic.task_processor import process_task
from apps.api.app.infra.db.session import session_scope
from apps.worker.worker.config import get_settings


def run_next_comic_task() -> str | None:
    worker_name = get_settings().worker_name
    with session_scope() as session:
        task = claim_next_task(session, worker_name=worker_name)
        if task is None:
            return None
        task_id = task.id
    with session_scope() as session:
        process_task(session, task_id=task_id)
    return task_id
