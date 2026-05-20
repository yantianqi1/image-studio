from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.domains.llm.catalog import ACTIVE_MODEL_STATUS
from apps.api.app.domains.llm.models import Provider, SellableModel
from apps.api.app.domains.llm.provider_validation import OPENAI_COMPATIBLE_PROVIDER_TYPE
from apps.api.app.domains.llm.upstream_models import UpstreamModel, fetch_upstream_models

NEWAPI_PROVIDER_NAME = "newapi"
DEFAULT_NEWAPI_MODEL_CAPABILITY = "image"


def fetch_newapi_models() -> list[UpstreamModel]:
    settings = get_settings()
    return fetch_upstream_models(
        url=build_newapi_models_url(settings.newapi_base_url),
        api_key_env=settings.newapi_api_key_env,
    )


def build_newapi_models_url(base_url: str) -> str:
    normalized = base_url.strip().rstrip("/")
    if normalized.endswith("/models"):
        return normalized
    return f"{normalized}/models"


def sync_newapi_models(session: Session) -> list[SellableModel]:
    provider = ensure_newapi_provider(session)
    synced_models = [
        upsert_newapi_model(session, provider=provider, upstream_model=model)
        for model in fetch_newapi_models()
    ]
    session.flush()
    return synced_models


def ensure_newapi_provider(session: Session) -> Provider:
    settings = get_settings()
    provider = session.execute(select(Provider).where(Provider.name == NEWAPI_PROVIDER_NAME)).scalar_one_or_none()
    if provider is None:
        provider = Provider(name=NEWAPI_PROVIDER_NAME)
        session.add(provider)
    provider.type = OPENAI_COMPATIBLE_PROVIDER_TYPE
    provider.base_url = settings.newapi_base_url.strip().rstrip("/")
    provider.api_key_env = settings.newapi_api_key_env.strip()
    provider.status = "active"
    session.flush()
    return provider


def upsert_newapi_model(
    session: Session,
    *,
    provider: Provider,
    upstream_model: UpstreamModel,
) -> SellableModel:
    model = session.execute(select(SellableModel).where(SellableModel.code == upstream_model.id)).scalar_one_or_none()
    if model is None:
        model = SellableModel(
            code=upstream_model.id,
            display_name=upstream_model.display_name,
            capability=infer_newapi_model_capability(upstream_model.id),
            provider_id=provider.id,
            provider_model=upstream_model.id,
            public_enabled=False,
            status=ACTIVE_MODEL_STATUS,
        )
        session.add(model)
        session.flush()
        return model
    model.display_name = upstream_model.display_name
    model.provider_id = provider.id
    model.provider_model = upstream_model.id
    model.status = ACTIVE_MODEL_STATUS
    session.flush()
    return model


def infer_newapi_model_capability(model_id: str) -> str:
    normalized = model_id.strip().lower()
    if "image" in normalized or "vision" in normalized:
        return "image"
    return "chat"
