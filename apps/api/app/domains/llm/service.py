from __future__ import annotations

from dataclasses import dataclass
from sqlalchemy import case, select
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.llm.catalog import (
    ACTIVE_MODEL_STATUS,
    DELETED_PROVIDER_STATUS,
    DEFAULT_MODEL_CODE,
    DEFAULT_PROVIDER_NAME,
    ensure_provider_catalog,
)
from apps.api.app.domains.llm.client_provider import ClientProviderConfig, build_runtime_provider
from apps.api.app.domains.llm.image_reference import extract_image_reference
from apps.api.app.domains.llm.models import Provider, SellableModel, ModelVariant
from apps.api.app.domains.llm.openai_chat_image import render_openai_chat_compatible_image
from apps.api.app.domains.llm.openai_image import render_openai_compatible_image
from apps.api.app.domains.llm.openrouter_chat_image import render_openrouter_chat_image
from apps.api.app.domains.llm.provider_validation import (
    LOCAL_DEV_PROVIDER_TYPE,
    OPENAI_CHAT_COMPATIBLE_PROVIDER_TYPE,
    OPENAI_COMPATIBLE_PROVIDER_TYPE,
    OPENROUTER_CHAT_IMAGE_PROVIDER_TYPE,
    SUPPORTED_PROVIDER_TYPES,
    normalize_optional_string,
    validate_capability,
    validate_provider_config,
    validate_provider_type,
)
from apps.api.app.domains.llm.rendering import RenderedImage, render_local_image
from apps.api.app.domains.llm.upstream_models import fetch_upstream_models, resolve_selected_upstream_models


@dataclass(frozen=True)
class ModelExecutionTarget:
    provider: Provider
    model: SellableModel
    provider_model: str


def list_public_models(session: Session) -> list[SellableModel]:
    ensure_provider_catalog(session)
    statement = (
        select(SellableModel)
        .join(Provider, SellableModel.provider_id == Provider.id)
        .where(
            SellableModel.public_enabled.is_(True),
            SellableModel.capability == "image",
            SellableModel.status == ACTIVE_MODEL_STATUS,
            Provider.status == "active",
        )
        .order_by(
            case((SellableModel.code == DEFAULT_MODEL_CODE, 0), else_=1),
            SellableModel.id.asc(),
        )
    )
    return list(session.execute(statement).scalars())


def list_admin_models(session: Session) -> list[SellableModel]:
    ensure_provider_catalog(session)
    statement = (
        select(SellableModel)
        .where(SellableModel.status == ACTIVE_MODEL_STATUS)
        .order_by(SellableModel.id.asc())
    )
    return list(session.execute(statement).scalars())


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
            status=ACTIVE_MODEL_STATUS,
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
        model.status = ACTIVE_MODEL_STATUS
    session.flush()
    return model, created


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
        .where(
            SellableModel.code == code,
            SellableModel.public_enabled.is_(True),
            SellableModel.status == ACTIVE_MODEL_STATUS,
            Provider.status == "active",
        )
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
    conversation_messages: list[dict] | None = None,
    size: str | None = None,
    quality: str | None = None,
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
            size=size,
            quality=quality,
        )
    if provider.type == OPENAI_CHAT_COMPATIBLE_PROVIDER_TYPE:
        return render_openai_chat_compatible_image(
            session,
            provider=provider,
            prompt=prompt,
            provider_model=provider_model,
            source_asset_id=source_asset_id,
            reference_asset_ids=reference_ids,
            conversation_messages=conversation_messages,
            size=size,
            quality=quality,
        )
    if provider.type == OPENROUTER_CHAT_IMAGE_PROVIDER_TYPE:
        return render_openrouter_chat_image(
            session,
            provider=provider,
            prompt=prompt,
            provider_model=provider_model,
            source_asset_id=source_asset_id,
            reference_asset_ids=reference_ids,
            conversation_messages=conversation_messages,
            size=size,
            quality=quality,
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
    conversation_messages: list[dict] | None = None,
    size: str | None = None,
    quality: str | None = None,
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
            size=size,
            quality=quality,
        )
    if provider.type == OPENAI_CHAT_COMPATIBLE_PROVIDER_TYPE:
        return render_openai_chat_compatible_image(
            session,
            provider=provider,
            prompt=prompt,
            provider_model=provider_model,
            source_asset_id=source_asset_id,
            reference_asset_ids=reference_ids,
            conversation_messages=conversation_messages,
            size=size,
            quality=quality,
        )
    if provider.type == OPENROUTER_CHAT_IMAGE_PROVIDER_TYPE:
        return render_openrouter_chat_image(
            session,
            provider=provider,
            prompt=prompt,
            provider_model=provider_model,
            source_asset_id=source_asset_id,
            reference_asset_ids=reference_ids,
            conversation_messages=conversation_messages,
            size=size,
            quality=quality,
        )
    raise AppError(code="unsupported_provider_type", message="unsupported provider type", status_code=422)


def resolve_model_execution_target(session: Session, *, model_code: str) -> ModelExecutionTarget:
    model = get_public_model(session, code=model_code)
    provider = get_provider(session, provider_id=model.provider_id)
    provider_model = model.provider_model or provider.default_model
    if not provider_model:
        raise AppError(code="provider_model_missing", message="provider model missing", status_code=422)
    return ModelExecutionTarget(provider=provider, model=model, provider_model=provider_model)


def resolve_variant(session: Session, *, model_id: int, size: str | None, quality: str | None) -> ModelVariant | None:
    if size is None or quality is None:
        return None
    statement = (
        select(ModelVariant)
        .where(
            ModelVariant.model_id == model_id,
            ModelVariant.size == size,
            ModelVariant.quality == quality,
            ModelVariant.status == "active",
        )
    )
    variant = session.execute(statement).scalar_one_or_none()
    if variant is None:
        raise AppError(
            code="variant_not_found",
            message=f"no active pricing variant for size={size} quality={quality}",
            status_code=422,
        )
    return variant
