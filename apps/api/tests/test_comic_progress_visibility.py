from __future__ import annotations

from apps.api.app.domains.comic.models import ComicProject, ComicTask
from apps.api.app.domains.comic.pipeline import publish_task_stage
from apps.api.app.infra.db.session import initialize_database, session_scope


def test_publish_task_stage_commits_progress_for_frontend_polling() -> None:
    initialize_database()
    project_id = "proj_progress_visibility"
    task_id = "task_progress_visibility"
    with session_scope() as session:
        session.add(ComicProject(id=project_id, title="Progress", description="", genre="", status="draft"))
        session.add(ComicTask(id=task_id, project_id=project_id, task_type="scene-render", status="running", input_payload={}, output_payload={}))

    with session_scope() as session:
        task = session.get(ComicTask, task_id)
        assert task is not None
        publish_task_stage(session, task=task, stage="storyboarding", progress_percent=60)
        with session_scope() as reader:
            persisted = reader.get(ComicTask, task_id)
            assert persisted is not None
            assert persisted.stage == "storyboarding"
            assert persisted.progress_percent == 60
