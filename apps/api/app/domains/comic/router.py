from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.ownership import OwnerContext, ensure_anonymous_owner, resolve_request_owner
from apps.api.app.domains.auth.service import require_admin
from apps.api.app.domains.comic.schemas import (
    ComicCharacterBatchWrite,
    ComicChapterRead,
    ComicChapterWrite,
    ComicDeleteResult,
    ComicProjectCreate,
    ComicProjectRead,
    ComicProjectUpdate,
    ComicSceneRead,
    ComicSceneWrite,
    ComicTaskCreate,
    ComicTaskRead,
)
from apps.api.app.domains.llm.client_provider import read_client_provider_config
from apps.api.app.domains.public_quota.service import hash_request_ip, resolve_request_ip
from apps.api.app.domains.comic.image_generation import (
    approve_task_image_generation,
    list_task_image_results,
    regenerate_prompt_image,
)
from apps.api.app.domains.comic.character_references import (
    approve_character_references,
    list_character_references,
    sync_completed_character_references,
)
from apps.api.app.domains.comic.character_reference_packs import (
    ZIP_MEDIA_TYPE,
    export_character_reference_pack,
)
from apps.api.app.domains.comic.character_reference_pack_import import import_character_reference_pack
from apps.api.app.domains.comic.services import (
    create_project,
    create_task,
    delete_project,
    delete_task,
    get_project_detail,
    get_task_detail,
    list_project_details,
    list_task_details,
    save_characters,
    save_chapter,
    save_scene,
    update_project,
)

public_router = APIRouter(prefix="/comic", tags=["comic"])
admin_router = APIRouter(tags=["comic-admin"])


@public_router.post("/projects", status_code=status.HTTP_201_CREATED)
def create_project_endpoint(
    payload: ComicProjectCreate,
    request: Request,
    response: Response,
    session: Session = Depends(get_db_session),
) -> dict:
    owner = ensure_anonymous_owner(request, response, session)
    project = create_project(session, payload, owner=owner)
    return api_ok(ComicProjectRead.model_validate(project, from_attributes=True).model_dump(mode="json"))


@public_router.get("/projects")
def list_projects_endpoint(
    request: Request,
    response: Response,
    session: Session = Depends(get_db_session),
) -> dict:
    owner = ensure_anonymous_owner(request, response, session)
    projects = list_project_details(session, owner=owner)
    return api_ok([ComicProjectRead.model_validate(item, from_attributes=True).model_dump(mode="json") for item in projects])


@public_router.get("/projects/{project_id}")
def get_project_detail_endpoint(
    project_id: str,
    request: Request,
    session: Session = Depends(get_db_session),
) -> dict:
    project = get_project_detail(session, project_id, owner=resolve_request_owner(request, session))
    return api_ok(ComicProjectRead.model_validate(project, from_attributes=True).model_dump(mode="json"))


@public_router.patch("/projects/{project_id}")
def update_project_endpoint(
    project_id: str,
    payload: ComicProjectUpdate,
    request: Request,
    session: Session = Depends(get_db_session),
) -> dict:
    project = update_project(session, project_id, payload, owner=resolve_request_owner(request, session))
    return api_ok(ComicProjectRead.model_validate(project, from_attributes=True).model_dump(mode="json"))


@public_router.delete("/projects/{project_id}")
def delete_project_endpoint(
    project_id: str,
    request: Request,
    session: Session = Depends(get_db_session),
) -> dict:
    result = delete_project(session, project_id, owner=resolve_request_owner(request, session))
    return api_ok(ComicDeleteResult.model_validate(result).model_dump(mode="json"))


@public_router.put("/projects/{project_id}/characters")
def save_characters_endpoint(
    project_id: str,
    payload: ComicCharacterBatchWrite,
    request: Request,
    session: Session = Depends(get_db_session),
) -> dict:
    project = save_characters(session, project_id, payload.characters, owner=resolve_request_owner(request, session))
    data = ComicProjectRead.model_validate(project, from_attributes=True).model_dump(mode="json")
    return api_ok({"project_id": project_id, "characters": data["characters"]})


@public_router.put("/projects/{project_id}/chapters/{chapter_id}")
def save_chapter_endpoint(
    project_id: str,
    chapter_id: str,
    payload: ComicChapterWrite,
    request: Request,
    session: Session = Depends(get_db_session),
) -> dict:
    chapter = save_chapter(session, project_id, chapter_id, payload, owner=resolve_request_owner(request, session))
    return api_ok(ComicChapterRead.model_validate(chapter, from_attributes=True).model_dump(mode="json"))


@public_router.put("/projects/{project_id}/chapters/{chapter_id}/scenes/{scene_id}")
def save_scene_endpoint(
    project_id: str,
    chapter_id: str,
    scene_id: str,
    payload: ComicSceneWrite,
    request: Request,
    session: Session = Depends(get_db_session),
) -> dict:
    scene = save_scene(session, project_id, chapter_id, scene_id, payload, owner=resolve_request_owner(request, session))
    return api_ok(ComicSceneRead.model_validate(scene, from_attributes=True).model_dump(mode="json"))


@public_router.post("/tasks", status_code=status.HTTP_201_CREATED)
def create_task_endpoint(
    payload: ComicTaskCreate,
    request: Request,
    response: Response,
    session: Session = Depends(get_db_session),
) -> dict:
    owner = ensure_anonymous_owner(request, response, session)
    client_config = read_client_provider_config(request)
    task = create_task(
        session,
        payload,
        owner=owner,
        client_provider_config=client_config,
        client_provider_type=get_settings().openai_provider_type,
        request_ip_hash=resolve_comic_task_request_ip_hash(request, owner=owner),
        commit=False,
    )
    session.commit()
    return api_ok(ComicTaskRead.model_validate(task, from_attributes=True).model_dump(mode="json"))


def resolve_comic_task_request_ip_hash(request: Request, *, owner: OwnerContext) -> str | None:
    if owner.user_id is not None:
        return None
    return hash_request_ip(resolve_request_ip(request))


@public_router.get("/tasks/{task_id}")
def get_task_detail_endpoint(
    task_id: str,
    request: Request,
    session: Session = Depends(get_db_session),
) -> dict:
    task = get_task_detail(session, task_id, owner=resolve_request_owner(request, session))
    return api_ok(ComicTaskRead.model_validate(task, from_attributes=True).model_dump(mode="json"))


@public_router.get("/tasks")
def list_task_detail_endpoint(
    request: Request,
    response: Response,
    project_id: Optional[str] = Query(default=None),
    session: Session = Depends(get_db_session),
) -> dict:
    owner = ensure_anonymous_owner(request, response, session)
    tasks = list_task_details(session, owner=owner, project_id=project_id)
    return api_ok([ComicTaskRead.model_validate(task, from_attributes=True).model_dump(mode="json") for task in tasks])


@public_router.delete("/tasks/{task_id}")
def delete_task_endpoint(
    task_id: str,
    request: Request,
    session: Session = Depends(get_db_session),
) -> dict:
    result = delete_task(session, task_id, owner=resolve_request_owner(request, session))
    return api_ok(ComicDeleteResult.model_validate(result).model_dump(mode="json"))


@public_router.post("/tasks/{task_id}/approve-and-generate-images", status_code=status.HTTP_201_CREATED)
def approve_task_image_generation_endpoint(
    task_id: str,
    request: Request,
    session: Session = Depends(get_db_session),
) -> dict:
    return api_ok(approve_task_image_generation(session, task_id, owner=resolve_request_owner(request, session)))


@public_router.post("/tasks/{task_id}/character-references", status_code=status.HTTP_201_CREATED)
def approve_character_references_endpoint(
    task_id: str,
    request: Request,
    session: Session = Depends(get_db_session),
) -> dict:
    return api_ok(approve_character_references(session, task_id, owner=resolve_request_owner(request, session)))


@public_router.get("/tasks/{task_id}/character-references")
def list_character_references_endpoint(
    task_id: str,
    request: Request,
    session: Session = Depends(get_db_session),
) -> dict:
    return api_ok(list_character_references(session, task_id, owner=resolve_request_owner(request, session)))


@public_router.post("/tasks/{task_id}/character-references/sync")
def sync_character_references_endpoint(
    task_id: str,
    request: Request,
    session: Session = Depends(get_db_session),
) -> dict:
    return api_ok(sync_completed_character_references(session, task_id, owner=resolve_request_owner(request, session)))


@public_router.get("/tasks/{task_id}/character-references/export")
def export_character_reference_pack_endpoint(
    task_id: str,
    request: Request,
    session: Session = Depends(get_db_session),
) -> Response:
    content, filename = export_character_reference_pack(session, task_id, owner=resolve_request_owner(request, session))
    return Response(
        content=content,
        media_type=ZIP_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@public_router.post("/tasks/{task_id}/character-references/import", status_code=status.HTTP_201_CREATED)
async def import_character_reference_pack_endpoint(
    task_id: str,
    request: Request,
    file: UploadFile = File(...),
    session: Session = Depends(get_db_session),
) -> dict:
    return api_ok(
        import_character_reference_pack(
            session,
            task_id=task_id,
            content=await file.read(),
            owner=resolve_request_owner(request, session),
        )
    )


@public_router.post("/panel-prompts/{prompt_id}/regenerate-image", status_code=status.HTTP_201_CREATED)
def regenerate_prompt_image_endpoint(
    prompt_id: int,
    request: Request,
    session: Session = Depends(get_db_session),
) -> dict:
    return api_ok(regenerate_prompt_image(session, prompt_id, owner=resolve_request_owner(request, session)))


@public_router.get("/tasks/{task_id}/image-results")
def list_task_image_results_endpoint(
    task_id: str,
    request: Request,
    session: Session = Depends(get_db_session),
) -> dict:
    return api_ok(list_task_image_results(session, task_id, owner=resolve_request_owner(request, session)))


@admin_router.get("/comic-tasks")
@admin_router.get("/comic/tasks")
def admin_list_tasks_endpoint(
    request: Request,
    project_id: Optional[str] = Query(default=None),
    session: Session = Depends(get_db_session),
) -> dict:
    require_admin(request, session)
    tasks = list_task_details(session, project_id=project_id)
    return api_ok([ComicTaskRead.model_validate(task, from_attributes=True).model_dump(mode="json") for task in tasks])
