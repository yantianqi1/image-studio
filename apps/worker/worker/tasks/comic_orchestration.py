from __future__ import annotations

from apps.api.app.domains.comic.orchestrator import run_next_comic_orchestration_step
from apps.api.app.infra.db.session import session_scope


def run_next_comic_orchestration() -> str | None:
    with session_scope() as session:
        return run_next_comic_orchestration_step(session)
