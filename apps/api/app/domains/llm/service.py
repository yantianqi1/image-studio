from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.errors import AppError
from apps.api.app.domains.llm.catalog import DELETED_PROVIDER_STATUS, DEFAULT_MODEL_CODE, DEFAULT_PROVIDER_NAME, ensure_provider_catalog
from apps.api.app.domains.llm.client_provider import ClientProviderConfig, build_runtime_provider
from apps.api.app.domains.llm.image_reference import extract_image_reference
from apps.api.app.domains.llm.models import Provider, SellableModel
from apps.api.app.domains.llm.openai_chat_image import render_openai_chat_compatible_image
from apps.api.app.domains.llm.openai_image import render_openai_compatible_image
from apps.api.app.domains.llm.provider_validation import (
    LOCAL_DEV_PROVIDER_TYPE,
    OPENAI_CHAT_COMPATIBLE_PROVIDER_TYPE,
    OPENAI_COMPATIBLE_PROVIDER_TYPE,
    SUPPORTED_PROVIDER_TYPES,
    normalize_optional_string,
    validate_capability,
    validate_provider_config,
    validate_provider_type,
)
from apps.api.app.domains.llm.rendering import RenderedImage, render_local_image

UPSTREAM_MODELS_TIMEOUT_SECONDS = 20.0




@dataclass(frozen=True)
class ModelExecutionTarget:
    provider: Provider
    model: SellableModel
    provider_model: str


@dataclass(frozen=True)
class UpstreamModel:
    id: str
    display_name: str


def list_public_models(session: Session) -> list[SellableModel]:
    ensure_provider_catalog(session)
    statement = (
        select(SellableModel)
        .join(Provider, SellableModel.provider_id == Provider.id)
        .where(
            SellableModel.public_enabled.is_(True),
            SellableModel.capability == "image",
            Provider.status == "active",
        )
        .order_by(SellableModel.id.asc())
    )
    return list(session.execute(statement).scalars())


def list_admin_models(session: Session) -> list[SellableModel]:
    ensure_provider_catalog(session)
    return list(session.execute(select(SellableModel).order_by(SellableModel.id.asc())).scalars())


def list_providers(session: Session) -> list[Provider]:
    ensure_provider_catalog(session)
    statement = select(Provider).where(Provider.status != DELETED_PROVIDER_STATUS).order_by(Provider.id.asc())
    return list(session.execute(statement).scalars())


def create_provider(
    session: Session,
    *,
    name: str,
    provider_type: str,
    base_url: str | None,
    api_key_env: str | None,
    default_model: str | None,
) -> Provider:
    ensure_provider_catalog(session)
    provider_type = provider_type.strip()
    validate_provider_type(provider_type)
    validate_provider_config(
        provider_type=provider_type,
        base_url=base_url,
        api_key_env=api_key_env,
    )
    existing = session.execute(select(Provider).where(Provider.name == name)).scalar_one_or_none()
    if existing is not None and existing.status != DELETED_PROVIDER_STATUS:
        raise AppError(code="provider_exists", message="provider already exists", status_code=409)
    if existing is not None:
        existing.type = provider_type
        existing.base_url = normalize_optional_string(base_url)
        existing.api_key_env = normalize_optional_string(api_key_env)
        existing.default_model = normalize_optional_string(default_model)
        existing.status = "active"
        session.flush()
        return existing
    provider = Provider(
        name=name.strip(),
        type=provider_type,
        base_url=normalize_optional_string(base_url),
        api_key_env=normalize_optional_string(api_key_env),
        default_model=normalize_optional_string(default_model),
        status="active",
    )
    session.add(provider)
    session.flush()
    return provider


def create_or_update_sellable_model(
    session: Session,
    *,
    code: str,
    display_name: str,
    capability: str,
    provider_id: int,
    provider_model: str,
    public_enabled: bool,
    member_price_cents: int,
    anonymous_price_cents: int,
) -> tuple[SellableModel, bool]:
    ensure_provider_catalog(session)
    provider = get_provider(session, provider_id=provider_id)
    validate_capability(capability)
    if provider.type not in SUPPORTED_PROVIDER_TYPES:
        raise AppError(code="provider_type_invalid", message="provider type invalid", status_code=422)
    created = False
    model = session.execute(select(SellableModel).where(SellableModel.code == code)).scalar_one_or_none()
    if model is None:
        model = SellableModel(
            code=code.strip(),
            display_name=display_name.strip(),
            capability=capability.strip(),
            provider_id=provider.id,
            provider_model=provider_model.strip(),
            public_enabled=public_enabled,
            member_price_cents=member_price_cents,
            anonymous_price_cents=anonymous_price_cents,
        )
        session.add(model)
        created = True
    else:
        model.display_name = display_name.strip()
        model.capability = capability.strip()
        model.provider_id = provider.id
        model.provider_model = provider_model.strip()
        model.public_enabled = public_enabled
        model.member_price_cents = member_price_cents
        model.anonymous_price_cents = anonymous_price_cents
    session.flush()
    return model, created


def fetch_upstream_models(*, url: str, api_key_env: str | None) -> list[UpstreamModel]:
    response = httpx.get(
        normalize_upstream_url(url),
        headers=build_upstream_headers(api_key_env),
        timeout=UPSTREAM_MODELS_TIMEOUT_SECONDS,
    )
    if response.status_code >= 400:
        raise AppError(code="upstream_models_failed", message=extract_upstream_error(response), status_code=502)
    return parse_upstream_models(response.json())


def import_upstream_models(
    session: Session,
    *,
    url: str,
    api_key_env: str | None,
    provider_id: int,
    model_ids: list[str],
    capability: str,
    public_enabled: bool,
    member_price_cents: int,
    anonymous_price_cents: int,
) -> list[SellableModel]:
    upstream_models = {model.id: model for model in fetch_upstream_models(url=url, api_key_env=api_key_env)}
    selected_models = resolve_selected_upstream_models(upstream_models=upstream_models, model_ids=model_ids)
    return [
        create_or_update_sellable_model(
            session,
            code=model.id,
            display_name=model.display_name,
            capability=capability,
            provider_id=provider_id,
            provider_model=model.id,
            public_enabled=public_enabled,
            member_price_cents=member_price_cents,
            anonymous_price_cents=anonymous_price_cents,
        )[0]
        for model in selected_models
    ]


def normalize_upstream_url(url: str) -> str:
    normalized = url.strip()
    if not normalized.startswith(("http://", "https://")):
        raise AppError(code="upstream_url_invalid", message="upstream url invalid", status_code=422)
    return normalized


def build_upstream_headers(api_key_env: str | None) -> dict[str, str]:
    env_name = normalize_optional_string(api_key_env)
    if env_name is None:
        return {}
    value = os.environ.get(env_name)
    if not value:
        raise AppError(code="upstream_api_key_missing", message=f"upstream api key env {env_name} is not set", status_code=500)
    return {"Authorization": f"Bearer {value}"}


def parse_upstream_models(payload: object) -> list[UpstreamModel]:
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise AppError(code="upstream_models_invalid", message="upstream models response invalid", status_code=502)
    return [parse_upstream_model(item) for item in payload["data"]]


def parse_upstream_model(item: object) -> UpstreamModel:
    if not isinstance(item, dict) or not isinstance(item.get("id"), str):
        raise AppError(code="upstream_models_invalid", message="upstream model item invalid", status_code=502)
    model_id = item["id"].strip()
    if not model_id:
        raise AppError(code="upstream_models_invalid", message="upstream model id invalid", status_code=502)
    return UpstreamModel(id=model_id, display_name=model_id)


def resolve_selected_upstream_models(*, upstream_models: dict[str, UpstreamModel], model_ids: list[str]) -> list[UpstreamModel]:
    selected_models: list[UpstreamModel] = []
    for model_id in model_ids:
        normalized_id = model_id.strip()
        model = upstream_models.get(normalized_id)
        if model is None:
            raise AppError(code="upstream_model_not_found", message=f"upstream model {normalized_id} not found", status_code=404)
        selected_models.append(model)
    return selected_models


def extract_upstream_error(response: httpx.Response | object) -> str:
    try:
        payload = response.json()
    except Exception:
        return getattr(response, "text", "upstream models request failed")
    if isinstance(payload, dict) and isinstance(payload.get("error"), dict):
        message = payload["error"].get("message")
        if isinstance(message, str):
            return message
    return getattr(response, "text", "upstream models request failed")


def get_provider(session: Session, *, provider_id: int) -> Provider:
    provider = session.get(Provider, provider_id)
    if provider is None or provider.status == DELETED_PROVIDER_STATUS:
        raise AppError(code="provider_not_found", message="provider not found", status_code=404)
    return provider


def get_public_model(session: Session, *, code: str) -> SellableModel:
    ensure_provider_catalog(session)
    statement = (
        select(SellableModel)
        .join(Provider, SellableModel.provider_id == Provider.id)
        .where(SellableModel.code == code, SellableModel.public_enabled.is_(True), Provider.status == "active")
    )
    model = session.execute(statement).scalar_one_or_none()
    if model is None:
        raise AppError(code="model_not_found", message="model not found", status_code=404)
    return model


def render_image(
    session: Session,
    *,
    prompt: str,
    model_code: str,
    provider_id: int,
    provider_model: str,
    source_asset_id: int | None = None,
    reference_asset_ids: list[int] | None = None,
) -> RenderedImage:
    provider = get_provider(session, provider_id=provider_id)
    reference_ids = tuple(reference_asset_ids or [])
    if provider.status != "active":
        raise AppError(code="provider_not_active", message="provider not active", status_code=409)
    if provider.type == LOCAL_DEV_PROVIDER_TYPE:
        return render_local_image(prompt=prompt, model_code=model_code, reference_asset_ids=reference_ids)
    if provider.type == OPENAI_COMPATIBLE_PROVIDER_TYPE:
        return render_openai_compatible_image(
            session,
            provider=provider,
            prompt=prompt,
            provider_model=provider_model,
            source_asset_id=source_asset_id,
            reference_asset_ids=reference_ids,
        )
    if provider.type == OPENAI_CHAT_COMPATIBLE_PROVIDER_TYPE:
        return render_openai_chat_compatible_image(
            session,
            provider=provider,
            prompt=prompt,
            provider_model=provider_model,
            source_asset_id=source_asset_id,
            reference_asset_ids=reference_ids,
        )
    raise AppError(code="unsupported_provider_type", message="unsupported provider type", status_code=422)


def render_image_with_client_provider(
    session: Session,
    *,
    config: ClientProviderConfig,
    prompt: str,
    model_code: str,
    provider_model: str,
    source_asset_id: int | None = None,
    reference_asset_ids: list[int] | None = None,
) -> RenderedImage:
    provider = build_runtime_provider(config)
    reference_ids = tuple(reference_asset_ids or [])
    if provider.type == OPENAI_COMPATIBLE_PROVIDER_TYPE:
        return render_openai_compatible_image(
            session,
            provider=provider,
            prompt=prompt,
            provider_model=provider_model,
            source_asset_id=source_asset_id,
            reference_asset_ids=reference_ids,
        )
    if provider.type == OPENAI_CHAT_COMPATIBLE_PROVIDER_TYPE:
        return render_openai_chat_compatible_image(
            session,
            provider=provider,
            prompt=prompt,
            provider_model=provider_model,
            source_asset_id=source_asset_id,
            reference_asset_ids=reference_ids,
        )
    raise AppError(code="unsupported_provider_type", message="unsupported provider type", status_code=422)


def resolve_model_execution_target(session: Session, *, model_code: str) -> ModelExecutionTarget:
    model = get_public_model(session, code=model_code)
    provider = get_provider(session, provider_id=model.provider_id)
    provider_model = model.provider_model or provider.default_model
    if not provider_model:
        raise AppError(code="provider_model_missing", message="provider model missing", status_code=422)
    return ModelExecutionTarget(provider=provider, model=model, provider_model=provider_model)


def ensure_storage_dir() -> Path:
    path = Path(get_settings().generated_assets_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path
