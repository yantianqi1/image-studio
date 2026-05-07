from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.billing.models import WalletReservation
from apps.api.app.domains.billing.service import commit_reservation, create_reservation, release_reservation
from apps.api.app.domains.image.assets import delete_asset_objects
from apps.api.app.domains.image.models import Asset, ImageJob, ImageJobReferenceAsset, ImageJobResult
from apps.api.app.infra.storage.asset_storage import AssetStorage
from apps.api.app.infra.storage.factory import build_asset_storage

IMAGE_JOB_FAILED_ERROR_CODE = "image_job_failed"


def resolve_charge_cents(
    *,
    owner: OwnerContext,
    client_provider_config: Any | None,
    requested_count: int,
    member_price_cents: int,
    anonymous_price_cents: int,
) -> int:
    if client_provider_config is not None:
        return 0
    return member_price_cents * requested_count if owner.user_id is not None else anonymous_price_cents * requested_count


def resolve_source_asset(
    session: Session,
    *,
    mode: str,
    source_asset_id: int | None,
    owner: OwnerContext,
) -> Asset | None:
    if mode != "edit":
        return None
    if source_asset_id is None:
        raise AppError(code="source_asset_required", message="source asset required for edit mode", status_code=422)
    asset = get_asset(session, source_asset_id)
    if not asset_access_allowed(asset, owner=owner):
        raise AppError(code="source_asset_forbidden", message="source asset forbidden", status_code=403)
    return asset


def resolve_reference_assets(
    session: Session,
    *,
    reference_asset_ids: list[int] | None,
    owner: OwnerContext,
) -> list[Asset]:
    asset_ids = list(reference_asset_ids or [])
    assets: list[Asset] = []
    for asset_id in asset_ids:
        asset = session.get(Asset, asset_id)
        if asset is None:
            raise AppError(code="reference_asset_not_found", message="reference asset not found", status_code=404)
        if not asset_access_allowed(asset, owner=owner):
            raise AppError(code="reference_asset_forbidden", message="reference asset forbidden", status_code=403)
        assets.append(asset)
    return assets


def asset_access_allowed(asset: Asset, *, owner: OwnerContext) -> bool:
    if owner.user_id is not None:
        return asset.owner_user_id == owner.user_id
    if owner.anonymous_session_id is not None:
        return asset.owner_anonymous_session_id == owner.anonymous_session_id
    return False


def create_reference_asset_rows(session: Session, *, job_id: int, assets: list[Asset]) -> None:
    for index, asset in enumerate(assets, start=1):
        session.add(ImageJobReferenceAsset(job_id=job_id, asset_id=asset.id, sequence=index))
    session.flush()


def build_reservation(session: Session, *, owner: OwnerContext, charge_cents: int) -> int | None:
    if owner.user_id is None or charge_cents <= 0:
        return None
    reservation = create_reservation(session, user_id=owner.user_id, amount_cents=charge_cents, reason="image_job")
    reservation.reference_type = "image_job"
    return reservation.id


def get_job(session: Session, job_id: int) -> ImageJob:
    job = session.get(ImageJob, job_id)
    if job is None:
        raise AppError(code="image_job_not_found", message="image job not found", status_code=404)
    return job


def get_job_for_owner(session: Session, job_id: int, owner: OwnerContext) -> ImageJob:
    job = get_job(session, job_id)
    if not job_matches_owner(job, owner):
        raise AppError(code="image_job_not_found", message="image job not found", status_code=404)
    return job


def require_job_owner(job: ImageJob, *, owner: OwnerContext) -> None:
    if job_matches_owner(job, owner):
        return
    raise AppError(code="image_job_not_found", message="image job not found", status_code=404)


def job_matches_owner(job: ImageJob, owner: OwnerContext) -> bool:
    if owner.user_id is not None:
        return job.user_id == owner.user_id
    if owner.anonymous_session_id is not None:
        return job.anonymous_session_id == owner.anonymous_session_id
    return False


def get_asset(session: Session, asset_id: int) -> Asset:
    asset = session.get(Asset, asset_id)
    if asset is None:
        raise AppError(code="asset_not_found", message="asset not found", status_code=404)
    return asset


def get_asset_for_owner(session: Session, asset_id: int, owner: OwnerContext) -> Asset:
    asset = get_asset(session, asset_id)
    if not asset_access_allowed(asset, owner=owner):
        raise AppError(code="asset_not_found", message="asset not found", status_code=404)
    return asset


def list_job_results(session: Session, job_id: int) -> list[ImageJobResult]:
    statement = select(ImageJobResult).where(ImageJobResult.job_id == job_id).order_by(ImageJobResult.result_index.asc())
    return list(session.execute(statement).scalars())


def list_results_for_jobs(session: Session, job_ids: list[int]) -> dict[int, list[ImageJobResult]]:
    if not job_ids:
        return {}
    statement = (
        select(ImageJobResult)
        .where(ImageJobResult.job_id.in_(job_ids))
        .order_by(ImageJobResult.job_id.asc(), ImageJobResult.result_index.asc())
    )
    results_by_job_id = {job_id: [] for job_id in job_ids}
    for result in session.execute(statement).scalars():
        results_by_job_id.setdefault(result.job_id, []).append(result)
    return results_by_job_id


def list_reference_asset_ids(session: Session, *, job_id: int) -> list[int]:
    statement = select(ImageJobReferenceAsset.asset_id).where(ImageJobReferenceAsset.job_id == job_id)
    return list(session.execute(statement.order_by(ImageJobReferenceAsset.sequence.asc())).scalars())


def list_job_results_for_owner(session: Session, job_id: int, owner: OwnerContext) -> list[ImageJobResult]:
    get_job_for_owner(session, job_id, owner)
    return list_job_results(session, job_id)


def clear_job_reference_rows(session: Session, *, job_id: int) -> None:
    rows = list(session.execute(select(ImageJobReferenceAsset).where(ImageJobReferenceAsset.job_id == job_id)).scalars())
    for row in rows:
        session.delete(row)
    session.flush()


def clear_job_outputs(session: Session, *, job_id: int, storage: AssetStorage | None = None) -> None:
    results = list(session.execute(select(ImageJobResult).where(ImageJobResult.job_id == job_id)).scalars())
    asset_ids = [item.asset_id for item in results]
    for result in results:
        session.delete(result)
    session.flush()
    if asset_ids:
        asset_storage = storage or build_asset_storage()
        assets = list(session.execute(select(Asset).where(Asset.id.in_(asset_ids))).scalars())
        for asset in assets:
            delete_asset_objects(asset, asset_storage)
            session.delete(asset)
    session.flush()


def list_jobs(session: Session) -> list[ImageJob]:
    return list(session.execute(select(ImageJob).order_by(ImageJob.id.desc())).scalars())


def list_jobs_for_owner(session: Session, owner: OwnerContext) -> list[ImageJob]:
    if owner.user_id is not None:
        statement = select(ImageJob).where(ImageJob.user_id == owner.user_id)
    elif owner.anonymous_session_id is not None:
        statement = select(ImageJob).where(ImageJob.anonymous_session_id == owner.anonymous_session_id)
    else:
        return []
    return list(session.execute(statement.order_by(ImageJob.id.desc())).scalars())


def release_active_reservation(session: Session, *, job: ImageJob) -> None:
    if job.user_id is None or job.reservation_id is None:
        return
    reservation = session.get(WalletReservation, job.reservation_id)
    if reservation is None:
        raise AppError(code="reservation_not_found", message="reservation not found", status_code=404)
    if reservation.status == "reserved":
        release_reservation(session, user_id=job.user_id, reservation_id=job.reservation_id)


def delete_job(session: Session, *, job_id: int, owner: OwnerContext) -> dict[str, str | bool]:
    job = get_job_for_owner(session, job_id, owner)
    release_active_reservation(session, job=job)
    clear_job_reference_rows(session, job_id=job.id)
    clear_job_outputs(session, job_id=job.id)
    session.delete(job)
    session.flush()
    return {"deleted": True, "id": str(job_id)}


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
