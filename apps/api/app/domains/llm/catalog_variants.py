from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.llm.channel_pricing import CatalogVariantSeed
from apps.api.app.domains.llm.models import ModelVariant, Provider, SellableModel

DELETED_MODEL_STATUS = "deleted"
DELETED_PROVIDER_STATUS = "deleted"


def ensure_model_variants(
    session: Session,
    *,
    model: SellableModel,
    seeds: list[CatalogVariantSeed] | tuple[CatalogVariantSeed, ...],
) -> None:
    existing = list(
        session.execute(select(ModelVariant).where(ModelVariant.model_id == model.id)).scalars()
    )
    variants_by_key = {(variant.size, variant.quality): variant for variant in existing}
    for seed in seeds:
        variant = variants_by_key.get((seed.size, seed.quality))
        if variant is None:
            session.add(build_model_variant(model_id=model.id, seed=seed))
            continue
        update_catalog_variant(variant, seed=seed)
    session.flush()


def sync_existing_model_variants(
    session: Session,
    *,
    model_code: str,
    seeds: list[CatalogVariantSeed] | tuple[CatalogVariantSeed, ...],
) -> None:
    model = session.execute(
        select(SellableModel).where(SellableModel.code == model_code)
    ).scalar_one_or_none()
    if model is None or model.status == DELETED_MODEL_STATUS:
        return
    provider = session.get(Provider, model.provider_id)
    if provider is None or provider.status == DELETED_PROVIDER_STATUS:
        return
    ensure_model_variants(session, model=model, seeds=seeds)


def build_model_variant(*, model_id: int, seed: CatalogVariantSeed) -> ModelVariant:
    return ModelVariant(
        model_id=model_id,
        size=seed.size,
        quality=seed.quality,
        upstream_provider_model=seed.upstream_provider_model,
        upstream_cost_credits=seed.upstream_cost_credits,
        upstream_cost_cents=seed.upstream_cost_cents,
        member_price_credits=seed.member_price_credits,
        member_price_cents=seed.member_price_cents,
        anonymous_price_cents=seed.anonymous_price_cents,
        profit_margin_basis_points=seed.profit_margin_basis_points,
        price_manually_set=False,
        status=seed.status,
    )


def update_catalog_variant(variant: ModelVariant, *, seed: CatalogVariantSeed) -> None:
    if variant.price_manually_set:
        return
    variant.upstream_provider_model = seed.upstream_provider_model
    variant.upstream_cost_credits = seed.upstream_cost_credits
    variant.upstream_cost_cents = seed.upstream_cost_cents
    variant.member_price_credits = seed.member_price_credits
    variant.member_price_cents = seed.member_price_cents
    variant.anonymous_price_cents = seed.anonymous_price_cents
    variant.profit_margin_basis_points = seed.profit_margin_basis_points
    variant.status = seed.status
