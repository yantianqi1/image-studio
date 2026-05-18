from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.ownership import ensure_anonymous_owner, resolve_request_owner
from apps.api.app.domains.image.admin_routes import admin_router
from apps.api.app.domains.character_library.service import resolve_character_reference_bundle
from apps.api.app.domains.image.assets import (
    persist_uploaded_asset,
    resolve_asset_content,
    resolve_thumbnail_content,
)
from apps.api.app.domains.image.concurrency import enforce_image_job_submission_limit
from apps.api.app.domains.image.gallery import (
    delete_owned_asset,
    get_asset_for_read,
    list_gallery_items,
    load_assets_by_id,
    update_owned_asset_visibility,
)
from apps.api.app.domains.image.payloads import (
    asset_payload,
    build_asset_download_disposition,
    gallery_item_payload,
    job_payload,
    result_payload,
    upload_payload,
)
from apps.api.app.domains.image.schemas import CreateImageJobRequest, UpdateAssetVisibilityRequest
from apps.api.app.domains.image.service import (
    create_job,
    delete_job,
    get_job_for_owner,
    list_job_results_for_owner,
    list_jobs_for_owner,
)
from apps.api.app.domains.image.title_generation import generate_image_job_title
from apps.api.app.domains.llm.client_provider import CLIENT_PROVIDER_SOURCE, read_client_provider_config
from apps.api.app.domains.public_quota.constants import PUBLIC_QUOTA_FEATURE_IMAGE
from apps.api.app.domains.public_quota.service import consume_public_quota, resolve_request_ip
from apps.api.app.domains.settings.service import require_anonymous_image_enabled, require_uploads_enabled
from apps.api.app.infra.storage.factory import build_asset_storage

public_router = APIRouter(prefix="/image", tags=["image-public"])


@public_router.post("/jobs", status_code=status.HTTP_201_CREATED)
def create_image_job(
    payload: CreateImageJobRequest,
    request: Request,
    response: Response,
    session: Session = Depends(get_db_session),
):
    owner = ensure_anonymous_owner(request, response, session)
    client_config = read_client_provider_config(request)
    if owner.user_id is None and client_config is None:
        require_anonymous_image_enabled(session)
    if payload.mode == "edit" or payload.reference_asset_ids or payload.character_library_ids:
        require_uploads_enabled(session)
    source = resolve_image_job_source(owner=owner, has_client_provider=client_config is not None)
    enforce_image_job_submission_limit(session, owner=owner, source=source)
    character_bundle = resolve_character_reference_bundle(
        session,
        owner=owner,
        character_ids=payload.character_library_ids,
        prompt=payload.prompt,
    )
    title = generate_image_job_title(session, prompt=payload.prompt) if payload.auto_title else None
    job = create_job(
        session,
        owner=owner,
        source=source,
        title=title,
        prompt=character_bundle.prompt,
        model_code=payload.model_code,
        requested_count=payload.requested_count,
        mode=payload.mode,
        source_asset_id=payload.source_asset_id,
        reference_asset_ids=[*payload.reference_asset_ids, *character_bundle.asset_ids],
        conversation_messages=conversation_message_payloads(payload),
        client_access_id=client_config.client_id if client_config else None,
        client_provider_config=client_config,
        visibility=payload.visibility,
        size=payload.size,
        quality=payload.quality,
    )
    if should_consume_public_quota(owner=owner, has_client_provider=client_config is not None):
        consume_public_quota(
            session,
            request_ip=resolve_request_ip(request),
            feature=PUBLIC_QUOTA_FEATURE_IMAGE,
            reference_type="image_job",
            reference_id=str(job.id),
        )
    session.commit()
    return api_ok(job_payload(job))


def conversation_message_payloads(payload: CreateImageJobRequest) -> list[dict[str, object]]:
    return [message.model_dump(exclude_none=True) for message in payload.conversation_messages]


@public_router.get("/gallery")
def get_image_gallery(
    request: Request,
    response: Response,
    scope: str = Query(default="mine"),
    session: Session = Depends(get_db_session),
):
    owner = resolve_gallery_owner(request=request, response=response, session=session, scope=scope)
    storage = build_asset_storage()
    items = list_gallery_items(session, owner=owner, scope=scope)
    return api_ok([gallery_item_payload(result, job=job, asset=asset, storage=storage) for result, job, asset in items])


@public_router.get("/jobs")
def get_my_image_jobs(request: Request, response: Response, session: Session = Depends(get_db_session)):
    owner = ensure_anonymous_owner(request, response, session)
    return api_ok([
        job_payload(job)
        for job in list_jobs_for_owner(session, owner)
    ])


@public_router.get("/jobs/{job_id}")
def get_image_job(job_id: int, request: Request, session: Session = Depends(get_db_session)):
    return api_ok(job_payload(get_job_for_owner(session, job_id, resolve_request_owner(request, session))))


@public_router.get("/jobs/{job_id}/results")
def get_image_results(job_id: int, request: Request, session: Session = Depends(get_db_session)):
    results = list_job_results_for_owner(session, job_id, resolve_request_owner(request, session))
    assets_by_id = load_assets_by_id(session, [item.asset_id for item in results])
    storage = build_asset_storage()
    return api_ok([result_payload(item, asset=assets_by_id.get(item.asset_id), storage=storage) for item in results])


@public_router.delete("/jobs/{job_id}")
def delete_image_job(job_id: int, request: Request, session: Session = Depends(get_db_session)):
    owner = resolve_request_owner(request, session)
    result = delete_job(session, job_id=job_id, owner=owner)
    session.commit()
    return api_ok(result)


ASSET_CACHE_HEADERS = {"Cache-Control": "public, max-age=86400, s-maxage=604800", "CDN-Cache-Control": "public, max-age=604800"}


@public_router.get("/assets/{asset_id}")
def get_image_asset(asset_id: int, request: Request, session: Session = Depends(get_db_session)):
    asset = get_asset_for_read(session, asset_id, resolve_request_owner(request, session))
    content, media_type = resolve_asset_content(asset, build_asset_storage())
    return Response(content=content, media_type=media_type, headers=ASSET_CACHE_HEADERS)


@public_router.get("/assets/{asset_id}/download")
def download_image_asset(asset_id: int, request: Request, session: Session = Depends(get_db_session)):
    asset = get_asset_for_read(session, asset_id, resolve_request_owner(request, session))
    content, media_type = resolve_asset_content(asset, build_asset_storage())
    headers = {
        **ASSET_CACHE_HEADERS,
        "Content-Disposition": build_asset_download_disposition(asset.id, media_type),
    }
    return Response(content=content, media_type=media_type, headers=headers)


@public_router.get("/assets/{asset_id}/thumbnail")
def get_image_asset_thumbnail(asset_id: int, request: Request, session: Session = Depends(get_db_session)):
    asset = get_asset_for_read(session, asset_id, resolve_request_owner(request, session))
    content, media_type = resolve_thumbnail_content(asset, build_asset_storage())
    return Response(content=content, media_type=media_type, headers=ASSET_CACHE_HEADERS)


@public_router.patch("/assets/{asset_id}/visibility")
def update_image_asset_visibility(
    asset_id: int,
    payload: UpdateAssetVisibilityRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    asset = update_owned_asset_visibility(session, asset_id=asset_id, owner=resolve_request_owner(request, session), visibility=payload.visibility)
    session.commit()
    return api_ok(asset_payload(asset, storage=build_asset_storage()))


@public_router.delete("/assets/{asset_id}")
def delete_image_asset(
    asset_id: int,
    request: Request,
    session: Session = Depends(get_db_session),
):
    owner = resolve_request_owner(request, session)
    delete_owned_asset(session, asset_id=asset_id, owner=owner)
    session.commit()
    return api_ok({"deleted": True, "asset_id": asset_id})


@public_router.post("/uploads", status_code=status.HTTP_201_CREATED)
async def upload_image_asset(
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    session: Session = Depends(get_db_session),
):
    require_uploads_enabled(session)
    owner = ensure_anonymous_owner(request, response, session)
    client_config = read_client_provider_config(request)
    asset = persist_uploaded_asset(
        session,
        storage=build_asset_storage(),
        content=await file.read(),
        filename=file.filename,
        mime_type=file.content_type,
        user_id=owner.user_id,
        anonymous_session_id=owner.anonymous_session_id,
        client_id=client_config.client_id if owner.user_id is None and client_config else None,
    )
    session.commit()
    return api_ok(upload_payload(asset))


def resolve_image_job_source(*, owner, has_client_provider: bool) -> str:
    if has_client_provider:
        return CLIENT_PROVIDER_SOURCE
    if owner.user_id is not None:
        return "member"
    return "anonymous"


def should_consume_public_quota(*, owner, has_client_provider: bool) -> bool:
    return owner.user_id is None and not has_client_provider


def resolve_gallery_owner(*, request: Request, response: Response, session: Session, scope: str):
    if scope == "mine":
        return ensure_anonymous_owner(request, response, session)
    return resolve_request_owner(request, session)
