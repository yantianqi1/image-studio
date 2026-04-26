from pathlib import Path

from fastapi import APIRouter, Depends, File, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.service import get_user_by_token, require_admin
from apps.api.app.domains.image.assets import persist_uploaded_asset
from apps.api.app.domains.image.schemas import CreateImageJobRequest
from apps.api.app.domains.image.service import (
    create_job,
    delete_job,
    get_asset,
    get_job,
    list_job_results,
    list_jobs,
    list_jobs_for_user,
)
from apps.api.app.domains.llm.service import ensure_storage_dir
from apps.api.app.domains.settings.service import require_anonymous_image_enabled, require_uploads_enabled

public_router = APIRouter(prefix="/image", tags=["image-public"])
admin_router = APIRouter(tags=["image-admin"])


@public_router.post("/jobs", status_code=status.HTTP_201_CREATED)
def create_image_job(payload: CreateImageJobRequest, request: Request, session: Session = Depends(get_db_session)):
    token = request.cookies.get(get_settings().user_session_cookie_name)
    user = None
    if token:
        user = get_user_by_token(session, token)
    if user is None:
        require_anonymous_image_enabled(session)
    if payload.mode == "edit":
        require_uploads_enabled(session)
    job = create_job(
        session,
        user_id=user.id if user else None,
        source="member" if user else "anonymous",
        prompt=payload.prompt,
        model_code=payload.model_code,
        requested_count=payload.requested_count,
        mode=payload.mode,
        source_asset_id=payload.source_asset_id,
    )
    session.commit()
    return api_ok(job_payload(job))


@public_router.get("/jobs")
def get_my_image_jobs(request: Request, session: Session = Depends(get_db_session)):
    token = request.cookies.get(get_settings().user_session_cookie_name)
    user = get_user_by_token(session, token) if token else None
    return api_ok([job_payload(job) for job in list_jobs_for_user(session, user_id=user.id if user else None)])


@public_router.get("/jobs/{job_id}")
def get_image_job(job_id: int, session: Session = Depends(get_db_session)):
    return api_ok(job_payload(get_job(session, job_id)))


@public_router.get("/jobs/{job_id}/results")
def get_image_results(job_id: int, session: Session = Depends(get_db_session)):
    return api_ok([result_payload(item) for item in list_job_results(session, job_id)])


@public_router.delete("/jobs/{job_id}")
def delete_image_job(job_id: int, request: Request, session: Session = Depends(get_db_session)):
    token = request.cookies.get(get_settings().user_session_cookie_name)
    user = get_user_by_token(session, token) if token else None
    result = delete_job(session, job_id=job_id, user_id=user.id if user else None)
    session.commit()
    return api_ok(result)


@public_router.get("/assets/{asset_id}")
def get_image_asset(asset_id: int, session: Session = Depends(get_db_session)):
    asset = get_asset(session, asset_id)
    return FileResponse(Path(asset.storage_path), media_type=asset.mime_type)


@public_router.post("/uploads", status_code=status.HTTP_201_CREATED)
async def upload_image_asset(
    request: Request,
    file: UploadFile = File(...),
    session: Session = Depends(get_db_session),
):
    require_uploads_enabled(session)
    token = request.cookies.get(get_settings().user_session_cookie_name)
    user = None
    if token:
        user = get_user_by_token(session, token)
    if user is None:
        require_anonymous_image_enabled(session)
    asset = persist_uploaded_asset(
        session,
        storage_dir=ensure_storage_dir(),
        content=await file.read(),
        filename=file.filename,
        mime_type=file.content_type,
        user_id=user.id if user else None,
    )
    session.commit()
    return api_ok(upload_payload(asset))


@admin_router.get("/image-tasks")
@admin_router.get("/image/jobs")
def get_admin_jobs(request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    return api_ok([job_payload(job) for job in list_jobs(session)])


def job_payload(job) -> dict[str, object]:
    return {
        "id": job.id,
        "user_id": job.user_id,
        "source": job.source,
        "mode": job.mode,
        "prompt": job.prompt,
        "model_code": job.model_code,
        "source_asset_id": job.source_asset_id,
        "provider_id": job.provider_id,
        "provider_model": job.provider_model,
        "status": job.status,
        "requested_count": job.requested_count,
        "attempt_count": job.attempt_count,
        "max_attempts": job.max_attempts,
        "charge_cents": job.charge_cents,
        "error_code": job.error_code,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat(),
        "available_at": job.available_at.isoformat(),
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }


def result_payload(result) -> dict[str, object]:
    return {
        "id": result.id,
        "job_id": result.job_id,
        "result_index": result.result_index,
        "asset_id": result.asset_id,
        "asset_url": result.asset_url,
        "revised_prompt": result.revised_prompt,
        "provider_request_id": result.provider_request_id,
    }


def upload_payload(asset) -> dict[str, object]:
    return {
        "id": asset.id,
        "asset_url": f"/api/public/image/assets/{asset.id}",
        "storage_path": asset.storage_path,
        "mime_type": asset.mime_type,
        "created_at": asset.created_at.isoformat(),
    }
