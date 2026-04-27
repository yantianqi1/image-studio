from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session, selectinload

from apps.api.app.core.errors import AppError
from apps.api.app.domains.comic.constants import (
    TASK_STATUS_COMPLETED,
    TASK_STATUS_FAILED,
    TASK_STATUS_PENDING,
    TASK_STATUS_RUNNING,
)
from apps.api.app.domains.comic.models import (
    ComicChapter,
    ComicCharacter,
    ComicCharacterCard,
    ComicPanelPrompt,
    ComicProject,
    ComicScene,
    ComicStoryboard,
    ComicStoryAnalysis,
    ComicTask,
)

CLAIM_BATCH_SIZE = 10
TASK_STATUS_QUEUED = "queued"
CLAIMABLE_TASK_STATUSES = (TASK_STATUS_PENDING, TASK_STATUS_QUEUED)


def get_project(session: Session, project_id: str) -> ComicProject | None:
    statement = (
        select(ComicProject)
        .options(
            selectinload(ComicProject.characters),
            selectinload(ComicProject.chapters).selectinload(ComicChapter.scenes),
        )
        .where(ComicProject.id == project_id)
    )
    return session.execute(statement).scalar_one_or_none()


def get_chapter(session: Session, chapter_id: str) -> ComicChapter | None:
    statement = select(ComicChapter).options(selectinload(ComicChapter.scenes)).where(ComicChapter.id == chapter_id)
    return session.execute(statement).scalar_one_or_none()


def get_scene(session: Session, scene_id: str) -> ComicScene | None:
    statement = select(ComicScene).where(ComicScene.id == scene_id)
    return session.execute(statement).scalar_one_or_none()


def get_task(session: Session, task_id: str) -> ComicTask | None:
    statement = select(ComicTask).where(ComicTask.id == task_id)
    return session.execute(statement).scalar_one_or_none()


def create_task(session: Session, *, task: ComicTask) -> ComicTask:
    session.add(task)
    session.flush()
    return task


def claim_next_task(session: Session, *, worker_name: str) -> ComicTask | None:
    current_time = datetime.utcnow()
    task_ids = list(
        session.execute(
            select(ComicTask.id)
            .where(*build_claimable_task_condition(current_time))
            .order_by(ComicTask.available_at.asc(), ComicTask.created_at.asc())
            .limit(CLAIM_BATCH_SIZE)
        ).scalars()
    )
    for task_id in task_ids:
        if claim_task(session, task_id=task_id, worker_name=worker_name, current_time=current_time):
            return get_task(session, task_id)
    return None


def claim_task(session: Session, *, task_id: str, worker_name: str, current_time: datetime) -> bool:
    statement = (
        update(ComicTask)
        .where(ComicTask.id == task_id, *build_claimable_task_condition(current_time))
        .values(
            status=TASK_STATUS_RUNNING,
            stage="processing",
            progress_percent=5,
            attempt_count=ComicTask.attempt_count + 1,
            locked_by=worker_name,
            locked_at=current_time,
            started_at=current_time,
            finished_at=None,
            error_code=None,
            error_message=None,
        )
    )
    return session.execute(statement).rowcount == 1


def build_claimable_task_condition(current_time: datetime):
    return (
        ComicTask.status.in_(CLAIMABLE_TASK_STATUSES),
        or_(ComicTask.available_at.is_(None), ComicTask.available_at <= current_time),
    )


def update_task_stage(session: Session, *, task: ComicTask, stage: str, progress_percent: int) -> ComicTask:
    task.stage = stage
    task.progress_percent = progress_percent
    session.flush()
    return task


def mark_task_completed(session: Session, *, task: ComicTask, output_payload: dict) -> ComicTask:
    finished_at = datetime.utcnow()
    task.status = TASK_STATUS_COMPLETED
    task.stage = "completed"
    task.progress_percent = 100
    task.output_payload = dict(output_payload)
    task.error_code = None
    task.error_message = None
    task.finished_at = finished_at
    session.flush()
    return task


def mark_task_failed(session: Session, *, task: ComicTask, error_code: str, error_message: str) -> ComicTask:
    finished_at = datetime.utcnow()
    task.status = TASK_STATUS_FAILED
    task.stage = "failed"
    task.error_code = error_code
    task.error_message = error_message
    task.finished_at = finished_at
    session.flush()
    return task


def create_story_analysis(session: Session, *, analysis: ComicStoryAnalysis) -> ComicStoryAnalysis:
    session.add(analysis)
    session.flush()
    return analysis


def create_character_cards(session: Session, *, cards: list[ComicCharacterCard]) -> list[ComicCharacterCard]:
    session.add_all(cards)
    session.flush()
    return cards


def list_character_cards(session: Session, *, task_id: str) -> list[ComicCharacterCard]:
    statement = select(ComicCharacterCard).where(ComicCharacterCard.task_id == task_id)
    return list(session.execute(statement.order_by(ComicCharacterCard.id.asc())).scalars())


def get_character_card(session: Session, card_id: int) -> ComicCharacterCard | None:
    return session.get(ComicCharacterCard, card_id)


def update_character_reference_job(session: Session, *, card: ComicCharacterCard, job_id: int) -> None:
    card.reference_image_job_id = job_id
    session.flush()


def update_character_reference_asset(session: Session, *, card: ComicCharacterCard, asset_id: int) -> None:
    card.reference_asset_id = asset_id
    session.flush()


def create_storyboard(session: Session, *, storyboard: ComicStoryboard) -> ComicStoryboard:
    session.add(storyboard)
    session.flush()
    return storyboard


def create_panel_prompts(session: Session, *, prompts: list[ComicPanelPrompt]) -> list[ComicPanelPrompt]:
    session.add_all(prompts)
    session.flush()
    return prompts


def list_project_characters(session: Session, project_id: str) -> list[ComicCharacter]:
    statement = select(ComicCharacter).where(ComicCharacter.project_id == project_id)
    return list(session.execute(statement.order_by(ComicCharacter.created_at)).scalars())


def list_projects(session: Session) -> list[ComicProject]:
    statement = (
        select(ComicProject)
        .options(
            selectinload(ComicProject.characters),
            selectinload(ComicProject.chapters).selectinload(ComicChapter.scenes),
        )
        .order_by(ComicProject.created_at.desc())
    )
    return list(session.execute(statement).scalars())


def list_tasks(session: Session, project_id: str | None = None) -> list[ComicTask]:
    statement = select(ComicTask)
    if project_id is not None:
        statement = statement.where(ComicTask.project_id == project_id)
    return list(session.execute(statement.order_by(ComicTask.created_at.desc())).scalars())


def require_project(session: Session, project_id: str) -> ComicProject:
    project = get_project(session, project_id)
    if project is None:
        raise AppError(
            code="comic_project_not_found",
            message=f"comic project {project_id} not found",
            status_code=404,
        )
    return project


def require_chapter(session: Session, chapter_id: str) -> ComicChapter:
    chapter = get_chapter(session, chapter_id)
    if chapter is None:
        raise AppError(
            code="comic_chapter_not_found",
            message=f"comic chapter {chapter_id} not found",
            status_code=404,
        )
    return chapter


def require_scene(session: Session, scene_id: str) -> ComicScene:
    scene = get_scene(session, scene_id)
    if scene is None:
        raise AppError(
            code="comic_scene_not_found",
            message=f"comic scene {scene_id} not found",
            status_code=404,
        )
    return scene


def require_task(session: Session, task_id: str) -> ComicTask:
    task = get_task(session, task_id)
    if task is None:
        raise AppError(
            code="comic_task_not_found",
            message=f"comic task {task_id} not found",
            status_code=404,
        )
    return task


def validate_project_match(expected_id: str, actual_id: str, error_code: str) -> None:
    if expected_id != actual_id:
        raise AppError(
            code=error_code,
            message=f"{error_code} for scope {expected_id}",
            status_code=404,
        )


def generate_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"

