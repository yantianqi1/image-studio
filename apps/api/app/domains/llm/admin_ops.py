from __future__ import annotations

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.image.models import ImageJob
from apps.api.app.domains.llm.catalog import DELETED_MODEL_STATUS, DELETED_PROVIDER_STATUS
from apps.api.app.domains.llm.models import Provider, SellableModel


def delete_sellable_model(session: Session, *, model_code: str) -> None:
    model = session.execute(
        select(SellableModel).where(
            SellableModel.code == model_code,
            SellableModel.status != DELETED_MODEL_STATUS,
        )
    ).scalar_one_or_none()
    if model is None:
        raise AppError(code="model_not_found", message="model not found", status_code=404)
    model.status = DELETED_MODEL_STATUS
    session.flush()


def delete_provider(session: Session, *, provider_id: int) -> None:
    provider = session.get(Provider, provider_id)
    if provider is None:
        raise AppError(code="provider_not_found", message="provider not found", status_code=404)
    session.execute(update(ImageJob).where(ImageJob.provider_id == provider_id).values(provider_id=None))
    session.execute(delete(SellableModel).where(SellableModel.provider_id == provider_id))
    provider.status = DELETED_PROVIDER_STATUS
    session.flush()
