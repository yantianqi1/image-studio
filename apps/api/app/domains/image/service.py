from __future__ import annotations

from datetime import datetime, timedelta
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.billing.service import commit_reservation, create_reservation, release_reservation
from apps.api.app.domains.billing.models import WalletReservation
from apps.api.app.domains.image.assets import delete_asset_file, persist_rendered_asset
from apps.api.app.domains.image.models import Asset, ImageJob, ImageJobReferenceAsset, ImageJobResult
from apps.api.app.domains.llm.service import ensure_storage_dir, render_image, resolve_model_execution_target

IMAGE_JOB_MAX_ATTEMPTS = 3
IMAGE_JOB_RETRY_DELAY_SECONDS = 5
IMAGE_JOB_STALE_TIMEOUT_SECONDS = 300
IMAGE_JOB_RETRY_ERROR_CODE = "image_job_retry_scheduled"
IMAGE_JOB_FAILED_ERROR_CODE = "image_job_failed"
CLAIM_BATCH_SIZE = 10


def create_job(
    session: Session,
    *,
    user_id: int | None,
    source: str,
    prompt: str,
    model_code: str,
    requested_count: int,
    mode: str,
    source_asset_id: int | None = None,
    reference_asset_ids: list[int] | None = None,
) -> ImageJob:
    target = resolve_model_execution_target(session, model_code=model_code)
    source_asset = resolve_source_asset(session, mode=mode, source_asset_id=source_asset_id, user_id=user_id)
    reference_assets = resolve_reference_assets(session, reference_asset_ids=reference_asset_ids, user_id=user_id)
    model = target.model
    charge_cents = model.member_price_cents * requested_count if user_id else model.anonymous_price_cents * requested_count
    reservation_id = build_reservation(session, user_id=user_id, charge_cents=charge_cents)
    job = ImageJob(
        user_id=user_id,
        source=source,
        prompt=prompt,
        model_code=model_code,
        source_asset_id=source_asset.id if source_asset else None,
        provider_id=target.provider.id,
        provider_model=target.provider_model,
        requested_count=requested_count,
        mode=mode,
        charge_cents=charge_cents,
        reservation_id=reservation_id,
        max_attempts=IMAGE_JOB_MAX_ATTEMPTS,
        available_at=datetime.utcnow(),
    )
    session.add(job)
    session.flush()
    create_reference_asset_rows(session, job_id=job.id, assets=reference_assets)
    return job


def resolve_source_asset(
    session: Session,
    *,
    mode: str,
    source_asset_id: int | None,
    user_id: int | None,
) -> Asset | None:
    if mode != "edit":
        return None
    if source_asset_id is None:
        raise AppError(code="source_asset_required", message="source asset required for edit mode", status_code=422)
    asset = get_asset(session, source_asset_id)
    if asset.owner_user_id not in {None, user_id}:
        raise AppError(code="source_asset_forbidden", message="source asset forbidden", status_code=403)
    return asset


def resolve_reference_assets(
    session: Session,
    *,
    reference_asset_ids: list[int] | None,
    user_id: int | None,
) -> list[Asset]:
    asset_ids = list(reference_asset_ids or [])
    assets: list[Asset] = []
    for asset_id in asset_ids:
        asset = session.get(Asset, asset_id)
        if asset is None:
            raise AppError(code="reference_asset_not_found", message="reference asset not found", status_code=404)
        if asset.owner_user_id not in {None, user_id}:
            raise AppError(code="reference_asset_forbidden", message="reference asset forbidden", status_code=403)
        assets.append(asset)
    return assets


def create_reference_asset_rows(session: Session, *, job_id: int, assets: list[Asset]) -> None:
    for index, asset in enumerate(assets, start=1):
        session.add(ImageJobReferenceAsset(job_id=job_id, asset_id=asset.id, sequence=index))
    session.flush()


def build_reservation(session: Session, *, user_id: int | None, charge_cents: int) -> int | None:
    if user_id is None or charge_cents <= 0:
        return None
    reservation = create_reservation(session, user_id=user_id, amount_cents=charge_cents, reason="image_job")
    reservation.reference_type = "image_job"
    return reservation.id


def claim_next_job(session: Session) -> ImageJob | None:
    recover_stale_running_jobs(session)
    current_time = datetime.utcnow()
    job_ids = list(
        session.execute(
            select(ImageJob.id)
            .where(ImageJob.status == "queued", ImageJob.available_at <= current_time)
            .order_by(ImageJob.available_at.asc(), ImageJob.id.asc())
            .limit(CLAIM_BATCH_SIZE)
        ).scalars()
    )
    for job_id in job_ids:
        if claim_job(session, job_id=job_id, current_time=current_time):
            return get_job(session, job_id)
    return None


def claim_job(session: Session, *, job_id: int, current_time: datetime) -> bool:
    statement = (
        update(ImageJob)
        .where(ImageJob.id == job_id, ImageJob.status == "queued", ImageJob.available_at <= current_time)
        .values(
            status="running",
            attempt_count=ImageJob.attempt_count + 1,
            started_at=current_time,
            finished_at=None,
            error_code=None,
            error_message=None,
        )
    )
    return session.execute(statement).rowcount > 0


def process_claimed_job(session: Session, *, job_id: int) -> ImageJob:
    job = get_job(session, job_id)
    if job.status != "running":
        raise AppError(code="image_job_not_running", message="image job is not running", status_code=409)
    clear_job_outputs(session, job_id=job.id)
    try:
        process_render_results(session, job=job)
        complete_job(session, job=job)
    except Exception as exc:
        clear_job_outputs(session, job_id=job.id)
        handle_job_failure(session, job=job, exc=exc)
    session.flush()
    return job


def process_render_results(session: Session, *, job: ImageJob) -> None:
    storage_dir = ensure_storage_dir()
    reference_asset_ids = list_reference_asset_ids(session, job_id=job.id)
    for result_index in range(1, job.requested_count + 1):
        render_options = {
            "prompt": job.prompt,
            "model_code": job.model_code,
            "provider_id": job.provider_id or 0,
            "provider_model": job.provider_model or "",
        }
        if job.source_asset_id is not None:
            render_options["source_asset_id"] = job.source_asset_id
        if reference_asset_ids:
            render_options["reference_asset_ids"] = reference_asset_ids
        rendered = render_image(session, **render_options)
        asset = persist_rendered_asset(
            session,
            storage_dir=storage_dir,
            rendered=rendered,
            user_id=job.user_id,
        )
        session.add(
            ImageJobResult(
                job_id=job.id,
                result_index=result_index,
                asset_id=asset.id,
                asset_url=f"/api/public/image/assets/{asset.id}",
                revised_prompt=rendered.revised_prompt,
                provider_request_id=rendered.provider_request_id,
            )
        )
        session.flush()


def list_reference_asset_ids(session: Session, *, job_id: int) -> list[int]:
    statement = select(ImageJobReferenceAsset.asset_id).where(ImageJobReferenceAsset.job_id == job_id)
    return list(session.execute(statement.order_by(ImageJobReferenceAsset.sequence.asc())).scalars())


def complete_job(session: Session, *, job: ImageJob) -> None:
    finished_at = datetime.utcnow()
    if job.user_id and job.reservation_id:
        commit_reservation(session, user_id=job.user_id, reservation_id=job.reservation_id)
    job.status = "succeeded"
    job.error_code = None
    job.error_message = None
    job.available_at = finished_at
    job.finished_at = finished_at
    session.flush()


def handle_job_failure(session: Session, *, job: ImageJob, exc: Exception) -> None:
    if job.attempt_count >= job.max_attempts:
        mark_job_failed(session, job=job, error_message=str(exc))
        return
    retry_at = datetime.utcnow() + timedelta(seconds=IMAGE_JOB_RETRY_DELAY_SECONDS)
    job.status = "queued"
    job.error_code = IMAGE_JOB_RETRY_ERROR_CODE
    job.error_message = str(exc)
    job.available_at = retry_at
    job.finished_at = None
    session.flush()


def recover_stale_running_jobs(session: Session) -> None:
    stale_before = datetime.utcnow() - timedelta(seconds=IMAGE_JOB_STALE_TIMEOUT_SECONDS)
    jobs = list(
        session.execute(
            select(ImageJob).where(
                ImageJob.status == "running",
                ImageJob.started_at.is_not(None),
                ImageJob.started_at <= stale_before,
            )
        ).scalars()
    )
    for job in jobs:
        if job.attempt_count >= job.max_attempts:
            mark_job_failed(session, job=job, error_message="stale running image job expired")
            continue
        job.status = "queued"
        job.error_code = IMAGE_JOB_RETRY_ERROR_CODE
        job.error_message = "stale running image job requeued"
        job.available_at = datetime.utcnow()
        job.finished_at = None
    session.flush()


def mark_job_failed(session: Session, *, job: ImageJob, error_message: str) -> None:
    finished_at = datetime.utcnow()
    if job.user_id and job.reservation_id:
        release_reservation(session, user_id=job.user_id, reservation_id=job.reservation_id)
    job.status = "failed"
    job.error_code = IMAGE_JOB_FAILED_ERROR_CODE
    job.error_message = error_message
    job.available_at = finished_at
    job.finished_at = finished_at
    session.flush()


def get_job(session: Session, job_id: int) -> ImageJob:
    job = session.get(ImageJob, job_id)
    if job is None:
        raise AppError(code="image_job_not_found", message="image job not found", status_code=404)
    return job


def delete_job(session: Session, *, job_id: int, user_id: int | None) -> dict[str, str | bool]:
    job = get_job(session, job_id)
    require_job_owner(job, user_id=user_id)
    release_active_reservation(session, job=job)
    clear_job_reference_rows(session, job_id=job.id)
    clear_job_outputs(session, job_id=job.id)
    session.delete(job)
    session.flush()
    return {"deleted": True, "id": str(job_id)}


def require_job_owner(job: ImageJob, *, user_id: int | None) -> None:
    if job.user_id == user_id:
        return
    raise AppError(code="image_job_forbidden", message="image job forbidden", status_code=403)


def release_active_reservation(session: Session, *, job: ImageJob) -> None:
    if job.user_id is None or job.reservation_id is None:
        return
    reservation = session.get(WalletReservation, job.reservation_id)
    if reservation is None:
        raise AppError(code="reservation_not_found", message="reservation not found", status_code=404)
    if reservation.status == "reserved":
        release_reservation(session, user_id=job.user_id, reservation_id=job.reservation_id)


def clear_job_reference_rows(session: Session, *, job_id: int) -> None:
    rows = list(
        session.execute(select(ImageJobReferenceAsset).where(ImageJobReferenceAsset.job_id == job_id)).scalars()
    )
    for row in rows:
        session.delete(row)
    session.flush()


def list_job_results(session: Session, job_id: int) -> list[ImageJobResult]:
    statement = select(ImageJobResult).where(ImageJobResult.job_id == job_id).order_by(ImageJobResult.result_index.asc())
    return list(session.execute(statement).scalars())


def clear_job_outputs(session: Session, *, job_id: int) -> None:
    results = list(
        session.execute(select(ImageJobResult).where(ImageJobResult.job_id == job_id)).scalars()
    )
    asset_ids = [item.asset_id for item in results]
    for result in results:
        session.delete(result)
    session.flush()
    if asset_ids:
        assets = list(session.execute(select(Asset).where(Asset.id.in_(asset_ids))).scalars())
        for asset in assets:
            delete_asset_file(asset.storage_path)
            session.delete(asset)
    session.flush()


def list_jobs(session: Session) -> list[ImageJob]:
    return list(session.execute(select(ImageJob).order_by(ImageJob.id.desc())).scalars())


def list_jobs_for_user(session: Session, *, user_id: int | None) -> list[ImageJob]:
    statement = select(ImageJob)
    if user_id is None:
        statement = statement.where(ImageJob.user_id.is_(None))
    else:
        statement = statement.where(ImageJob.user_id == user_id)
    return list(session.execute(statement.order_by(ImageJob.id.desc())).scalars())


def get_asset(session: Session, asset_id: int) -> Asset:
    asset = session.get(Asset, asset_id)
    if asset is None:
        raise AppError(code="asset_not_found", message="asset not found", status_code=404)
    return asset
