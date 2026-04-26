from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.comic.constants import (
    PROJECT_STATUS_DRAFT,
    TASK_STATUS_PENDING,
)
from apps.api.app.domains.comic.models import (
    ComicChapter,
    ComicCharacter,
    ComicProject,
    ComicScene,
    ComicTask,
)
from apps.api.app.domains.comic.repository import (
    get_chapter,
    get_project,
    get_scene,
    create_task as insert_task,
    get_task,
    list_projects,
    list_tasks,
)
from apps.api.app.domains.comic.schemas import (
    ComicCharacterWrite,
    ComicChapterWrite,
    ComicProjectCreate,
    ComicProjectUpdate,
    ComicSceneWrite,
    ComicTaskCreate,
)
from apps.api.app.domains.llm.client_provider import ClientProviderConfig, serialize_client_provider_config


def create_project(session: Session, payload: ComicProjectCreate) -> ComicProject:
    project = ComicProject(
        id=generate_id("proj"),
        title=payload.title,
        description=payload.description,
        genre=payload.genre,
        status=PROJECT_STATUS_DRAFT,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return require_project(session, project.id)


def update_project(session: Session, project_id: str, payload: ComicProjectUpdate) -> ComicProject:
    project = require_project(session, project_id)
    project.title = payload.title
    project.description = payload.description
    project.genre = payload.genre
    project.status = payload.status
    session.commit()
    return require_project(session, project_id)


def delete_project(session: Session, project_id: str) -> dict[str, str | bool]:
    project = require_project(session, project_id)
    session.delete(project)
    session.commit()
    return {"deleted": True, "id": project_id}


def delete_task(session: Session, task_id: str) -> dict[str, str | bool]:
    task = require_task(session, task_id)
    session.delete(task)
    session.commit()
    return {"deleted": True, "id": task_id}


def save_characters(
    session: Session,
    project_id: str,
    characters: list[ComicCharacterWrite],
) -> ComicProject:
    project = require_project(session, project_id)
    existing = list(project.characters)
    for character in existing:
        session.delete(character)
    session.flush()

    for character in characters:
        session.add(
            ComicCharacter(
                id=generate_id("char"),
                project_id=project_id,
                name=character.name,
                role=character.role,
                profile=character.profile,
            )
        )
    session.commit()
    session.expire_all()
    return require_project(session, project_id)


def save_chapter(session: Session, project_id: str, chapter_id: str, payload: ComicChapterWrite) -> ComicChapter:
    require_project(session, project_id)
    chapter = get_chapter(session, chapter_id)
    if chapter is None:
        chapter = ComicChapter(
            id=chapter_id,
            project_id=project_id,
            title=payload.title,
            summary=payload.summary,
            sequence=payload.sequence,
        )
        session.add(chapter)
    else:
        validate_project_match(project_id, chapter.project_id, "comic_chapter_not_found")
        chapter.title = payload.title
        chapter.summary = payload.summary
        chapter.sequence = payload.sequence
    session.commit()
    return require_chapter(session, chapter_id)


def save_scene(
    session: Session,
    project_id: str,
    chapter_id: str,
    scene_id: str,
    payload: ComicSceneWrite,
) -> ComicScene:
    chapter = require_chapter(session, chapter_id)
    validate_project_match(project_id, chapter.project_id, "comic_chapter_not_found")
    scene = get_scene(session, scene_id)
    if scene is None:
        scene = ComicScene(
            id=scene_id,
            chapter_id=chapter_id,
            title=payload.title,
            summary=payload.summary,
            sequence=payload.sequence,
            shots=list(payload.shots),
        )
        session.add(scene)
    else:
        validate_project_match(chapter_id, scene.chapter_id, "comic_scene_not_found")
        scene.title = payload.title
        scene.summary = payload.summary
        scene.sequence = payload.sequence
        scene.shots = list(payload.shots)
    session.commit()
    return require_scene(session, scene_id)


def get_project_detail(session: Session, project_id: str) -> ComicProject:
    return require_project(session, project_id)


def list_project_details(session: Session) -> list[ComicProject]:
    return list_projects(session)


def create_task(
    session: Session,
    payload: ComicTaskCreate,
    *,
    user_id: int | None = None,
    client_provider_config: ClientProviderConfig | None = None,
    client_provider_type: str | None = None,
) -> ComicTask:
    require_project(session, payload.project_id)
    chapter = validate_task_chapter(session, payload.project_id, payload.chapter_id)
    validate_task_scene(session, chapter, payload.scene_id)
    provider_config = serialize_client_provider_config(
        config=client_provider_config,
        provider_type=client_provider_type or "",
    ) if client_provider_config else None
    task = ComicTask(
        id=generate_id("task"),
        project_id=payload.project_id,
        chapter_id=payload.chapter_id,
        scene_id=payload.scene_id,
        user_id=user_id,
        client_access_id=client_provider_config.client_id if client_provider_config else None,
        client_provider_config=provider_config,
        task_type=payload.task_type,
        status=TASK_STATUS_PENDING,
        stage="queued",
        progress_percent=0,
        input_payload=dict(payload.input_payload),
        output_payload={},
        error_code=None,
        error_message=None,
        attempt_count=0,
        max_attempts=1,
        available_at=datetime.utcnow(),
    )
    insert_task(session, task=task)
    session.commit()
    return require_task(session, task.id)


def get_task_detail(session: Session, task_id: str) -> ComicTask:
    return require_task(session, task_id)


def list_task_details(session: Session, project_id: str | None = None) -> list[ComicTask]:
    return list_tasks(session, project_id=project_id)



def validate_task_chapter(
    session: Session,
    project_id: str,
    chapter_id: str | None,
) -> ComicChapter | None:
    if chapter_id is None:
        return None
    chapter = require_chapter(session, chapter_id)
    validate_project_match(project_id, chapter.project_id, "comic_chapter_not_found")
    return chapter


def validate_task_scene(
    session: Session,
    chapter: ComicChapter | None,
    scene_id: str | None,
) -> ComicScene | None:
    if scene_id is None:
        return None
    scene = require_scene(session, scene_id)
    if chapter is None:
        raise AppError(
            code="comic_task_invalid_scope",
            message="scene tasks require chapter_id",
            status_code=422,
        )
    validate_project_match(chapter.id, scene.chapter_id, "comic_scene_not_found")
    return scene


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
