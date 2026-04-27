from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from apps.api.app.core.errors import AppError
from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.comic.models import ComicChapter, ComicProject, ComicTask
from apps.api.app.domains.comic.repository import get_project, get_task


def get_project_for_owner(session: Session, project_id: str, owner: OwnerContext) -> ComicProject | None:
    project = get_project(session, project_id)
    if project is None or not project_matches_owner(project, owner):
        return None
    return project


def get_task_for_owner(session: Session, task_id: str, owner: OwnerContext) -> ComicTask | None:
    task = get_task(session, task_id)
    if task is None or not task_matches_owner(task, owner):
        return None
    return task


def list_projects_for_owner(session: Session, owner: OwnerContext) -> list[ComicProject]:
    if owner.user_id is not None:
        statement = select(ComicProject).where(ComicProject.owner_user_id == owner.user_id)
    elif owner.anonymous_session_id is not None:
        statement = select(ComicProject).where(ComicProject.owner_anonymous_session_id == owner.anonymous_session_id)
    else:
        return []
    statement = statement.options(
        selectinload(ComicProject.characters),
        selectinload(ComicProject.chapters).selectinload(ComicChapter.scenes),
    ).order_by(ComicProject.created_at.desc())
    return list(session.execute(statement).scalars())


def list_tasks_for_owner(
    session: Session,
    owner: OwnerContext,
    project_id: str | None = None,
) -> list[ComicTask]:
    if owner.user_id is not None:
        statement = select(ComicTask).where(ComicTask.user_id == owner.user_id)
    elif owner.anonymous_session_id is not None:
        statement = select(ComicTask).where(ComicTask.anonymous_session_id == owner.anonymous_session_id)
    else:
        return []
    if project_id is not None:
        statement = statement.where(ComicTask.project_id == project_id)
    return list(session.execute(statement.order_by(ComicTask.created_at.desc())).scalars())


def project_matches_owner(project: ComicProject, owner: OwnerContext) -> bool:
    if owner.user_id is not None:
        return project.owner_user_id == owner.user_id
    if owner.anonymous_session_id is not None:
        return project.owner_anonymous_session_id == owner.anonymous_session_id
    return False


def task_matches_owner(task: ComicTask, owner: OwnerContext) -> bool:
    if owner.user_id is not None:
        return task.user_id == owner.user_id
    if owner.anonymous_session_id is not None:
        return task.anonymous_session_id == owner.anonymous_session_id
    return False


def require_project_for_owner(session: Session, project_id: str, owner: OwnerContext) -> ComicProject:
    project = get_project_for_owner(session, project_id, owner)
    if project is None:
        raise AppError(code="comic_project_not_found", message=f"comic project {project_id} not found", status_code=404)
    return project


def require_task_for_owner(session: Session, task_id: str, owner: OwnerContext) -> ComicTask:
    task = get_task_for_owner(session, task_id, owner)
    if task is None:
        raise AppError(code="comic_task_not_found", message=f"comic task {task_id} not found", status_code=404)
    return task
