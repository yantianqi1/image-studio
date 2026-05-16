from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.domains.llm.channel_pricing import (
    OFFICIAL_GPT_IMAGE_2_VARIANTS,
    build_lowcost_image_variant_seeds,
    build_openrouter_image_variant_seeds,
)
from apps.api.app.domains.llm.catalog_variants import (
    ensure_model_variants,
    sync_existing_model_variants,
)
from apps.api.app.domains.llm.models import Provider, SellableModel
from apps.api.app.domains.llm.provider_validation import (
    LOCAL_DEV_PROVIDER_TYPE,
    OPENAI_CHAT_COMPATIBLE_PROVIDER_TYPE,
    OPENAI_COMPATIBLE_PROVIDER_TYPE,
    OPENROUTER_CHAT_IMAGE_PROVIDER_TYPE,
    validate_capability,
    validate_provider_config,
)

DEFAULT_PROVIDER_NAME = "local-dev"
DEFAULT_MODEL_CODE = "local-dev-image"
ACTIVE_MODEL_STATUS = "active"
DELETED_MODEL_STATUS = "deleted"
DELETED_PROVIDER_STATUS = "deleted"
LOCAL_DEV_PUBLIC_ENVS = frozenset({"development", "test"})


@dataclass(frozen=True)
class CatalogModelSeed:
    code: str
    display_name: str
    capability: str
    provider_model: str
    member_price_cents: int
    anonymous_price_cents: int
    public_enabled: bool


def ensure_provider_catalog(session: Session) -> None:
    local_provider = ensure_local_provider(session)
    if local_provider is not None:
        ensure_local_image_model(session, provider=local_provider)
    openai_provider = ensure_configured_openai_provider(session)
    if openai_provider is not None:
        ensure_catalog_model(session, provider=openai_provider, seed=build_chat_model_seed())
        image_model = ensure_catalog_model(session, provider=openai_provider, seed=build_image_model_seed())
        if image_model is not None:
            ensure_model_variants(session, model=image_model, seeds=build_lowcost_image_variant_seeds())
    official_provider = ensure_official_openai_provider(session)
    if official_provider is not None:
        official_model = ensure_catalog_model(session, provider=official_provider, seed=build_official_image_model_seed())
        if official_model is not None:
            ensure_model_variants(session, model=official_model, seeds=OFFICIAL_GPT_IMAGE_2_VARIANTS)
    openrouter_provider = ensure_openrouter_provider(session)
    if openrouter_provider is not None:
        openrouter_model = ensure_catalog_model(session, provider=openrouter_provider, seed=build_openrouter_image_model_seed())
        if openrouter_model is not None:
            ensure_model_variants(session, model=openrouter_model, seeds=build_openrouter_image_variant_seeds())
    sync_existing_canonical_model_variants(session)
    session.flush()


def ensure_local_provider(session: Session) -> Provider | None:
    provider = session.execute(select(Provider).where(Provider.name == DEFAULT_PROVIDER_NAME)).scalar_one_or_none()
    if provider is not None and provider.status == DELETED_PROVIDER_STATUS:
        return None
    if provider is None:
        provider = Provider(
            name=DEFAULT_PROVIDER_NAME,
            type=LOCAL_DEV_PROVIDER_TYPE,
            status="active",
            default_model=DEFAULT_MODEL_CODE,
        )
        session.add(provider)
        session.flush()
    elif not provider.default_model:
        provider.default_model = DEFAULT_MODEL_CODE
        session.flush()
    return provider


def ensure_local_image_model(session: Session, *, provider: Provider) -> None:
    model = session.execute(select(SellableModel).where(SellableModel.code == DEFAULT_MODEL_CODE)).scalar_one_or_none()
    if model is None:
        model = SellableModel(
            code=DEFAULT_MODEL_CODE,
            display_name="Local Dev Image",
            capability="image",
            provider_id=provider.id,
            provider_model=DEFAULT_MODEL_CODE,
            member_price_cents=25,
            anonymous_price_cents=0,
            status=ACTIVE_MODEL_STATUS,
        )
        session.add(model)
    if model.status == DELETED_MODEL_STATUS:
        return
    model.provider_id = provider.id
    model.provider_model = DEFAULT_MODEL_CODE
    model.public_enabled = is_local_dev_public_enabled()
    model.status = ACTIVE_MODEL_STATUS
    session.flush()


def is_local_dev_public_enabled() -> bool:
    return get_settings().app_env.strip().lower() in LOCAL_DEV_PUBLIC_ENVS


def ensure_configured_openai_provider(session: Session) -> Provider | None:
    settings = get_settings()
    provider_type = settings.openai_provider_type.strip() or OPENAI_CHAT_COMPATIBLE_PROVIDER_TYPE
    validate_provider_config(
        provider_type=provider_type,
        base_url=settings.openai_provider_base_url,
        api_key_env=settings.openai_provider_api_key_env,
    )
    provider = session.execute(select(Provider).where(Provider.name == settings.openai_provider_name)).scalar_one_or_none()
    if provider is not None and provider.status == DELETED_PROVIDER_STATUS:
        return None
    if provider is None:
        provider = Provider(name=settings.openai_provider_name)
        session.add(provider)
    provider.type = provider_type
    provider.base_url = settings.openai_provider_base_url.strip()
    provider.api_key_env = settings.openai_provider_api_key_env.strip()
    provider.default_model = settings.openai_provider_default_model.strip()
    provider.status = "active"
    session.flush()
    return provider


def ensure_official_openai_provider(session: Session) -> Provider | None:
    settings = get_settings()
    validate_provider_config(
        provider_type=settings.openai_official_provider_type,
        base_url=settings.openai_official_provider_base_url,
        api_key_env=settings.openai_official_provider_api_key_env,
    )
    provider = session.execute(
        select(Provider).where(Provider.name == settings.openai_official_provider_name)
    ).scalar_one_or_none()
    if provider is not None and provider.status == DELETED_PROVIDER_STATUS:
        return None
    if provider is None:
        provider = Provider(name=settings.openai_official_provider_name)
        session.add(provider)
    provider.type = settings.openai_official_provider_type.strip()
    provider.base_url = settings.openai_official_provider_base_url.strip()
    provider.api_key_env = settings.openai_official_provider_api_key_env.strip()
    provider.default_model = settings.openai_official_provider_default_model.strip()
    provider.status = "active"
    session.flush()
    return provider


def ensure_openrouter_provider(session: Session) -> Provider | None:
    settings = get_settings()
    provider_type = settings.openrouter_provider_type.strip() or OPENROUTER_CHAT_IMAGE_PROVIDER_TYPE
    validate_provider_config(
        provider_type=provider_type,
        base_url=settings.openrouter_provider_base_url,
        api_key_env=settings.openrouter_provider_api_key_env,
    )
    provider = session.execute(select(Provider).where(Provider.name == settings.openrouter_provider_name)).scalar_one_or_none()
    if provider is not None and provider.status == DELETED_PROVIDER_STATUS:
        return None
    if provider is None:
        provider = Provider(name=settings.openrouter_provider_name)
        session.add(provider)
    provider.type = provider_type
    provider.base_url = settings.openrouter_provider_base_url.strip()
    provider.api_key_env = settings.openrouter_provider_api_key_env.strip()
    provider.default_model = settings.openrouter_provider_default_model.strip()
    provider.status = "active"
    session.flush()
    return provider


def build_chat_model_seed() -> CatalogModelSeed:
    settings = get_settings()
    return CatalogModelSeed(
        code=settings.openai_chat_model_code,
        display_name=settings.openai_chat_model_display_name,
        capability="chat",
        provider_model=settings.openai_chat_model_provider_model,
        member_price_cents=settings.openai_chat_model_member_price_cents,
        anonymous_price_cents=settings.openai_chat_model_anonymous_price_cents,
        public_enabled=False,
    )


def build_image_model_seed() -> CatalogModelSeed:
    settings = get_settings()
    return CatalogModelSeed(
        code=settings.openai_image_model_code,
        display_name=settings.openai_image_model_display_name,
        capability="image",
        provider_model=settings.openai_image_model_provider_model,
        member_price_cents=settings.openai_image_model_member_price_cents,
        anonymous_price_cents=settings.openai_image_model_anonymous_price_cents,
        public_enabled=True,
    )


def build_official_image_model_seed() -> CatalogModelSeed:
    settings = get_settings()
    return CatalogModelSeed(
        code=settings.openai_official_image_model_code,
        display_name=settings.openai_official_image_model_display_name,
        capability="image",
        provider_model=settings.openai_official_image_model_provider_model,
        member_price_cents=settings.openai_official_image_model_member_price_cents,
        anonymous_price_cents=settings.openai_official_image_model_anonymous_price_cents,
        public_enabled=True,
    )


def build_openrouter_image_model_seed() -> CatalogModelSeed:
    settings = get_settings()
    return CatalogModelSeed(
        code=settings.openrouter_image_model_code,
        display_name=settings.openrouter_image_model_display_name,
        capability="image",
        provider_model=settings.openrouter_image_model_provider_model,
        member_price_cents=settings.openrouter_image_model_member_price_cents,
        anonymous_price_cents=settings.openrouter_image_model_anonymous_price_cents,
        public_enabled=True,
    )


def ensure_catalog_model(session: Session, *, provider: Provider, seed: CatalogModelSeed) -> SellableModel | None:
    validate_capability(seed.capability)
    model = session.execute(select(SellableModel).where(SellableModel.code == seed.code)).scalar_one_or_none()
    if model is None:
        model = SellableModel(
            code=seed.code.strip(),
            display_name=seed.display_name.strip(),
            capability=seed.capability,
            provider_id=provider.id,
            provider_model=seed.provider_model.strip(),
            public_enabled=seed.public_enabled,
            member_price_cents=seed.member_price_cents,
            anonymous_price_cents=seed.anonymous_price_cents,
            status=ACTIVE_MODEL_STATUS,
        )
        session.add(model)
    elif model.status == DELETED_MODEL_STATUS:
        return None
    session.flush()
    return model


def sync_existing_canonical_model_variants(session: Session) -> None:
    sync_existing_model_variants(
        session,
        model_code=build_image_model_seed().code,
        seeds=build_lowcost_image_variant_seeds(),
    )
    sync_existing_model_variants(
        session,
        model_code=build_official_image_model_seed().code,
        seeds=OFFICIAL_GPT_IMAGE_2_VARIANTS,
    )
    sync_existing_model_variants(
        session,
        model_code=build_openrouter_image_model_seed().code,
        seeds=build_openrouter_image_variant_seeds(),
    )
