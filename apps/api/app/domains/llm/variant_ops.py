from collections.abc import Collection

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.llm.default_pricing import apply_profit_margin, cents_to_price_credits
from apps.api.app.domains.llm.models import ModelVariant, SellableModel
from apps.api.app.domains.llm.route_schemas import BatchVariantItem


def resolve_margin_price(payload: object) -> int:
    upstream_cost_cents = getattr(payload, "upstream_cost_cents")
    if upstream_cost_cents is None:
        return getattr(payload, "member_price_cents")
    margin_basis_points = getattr(payload, "profit_margin_basis_points")
    return apply_profit_margin(upstream_cost_cents, margin_basis_points)


def require_model(session: Session, *, model_id: int) -> SellableModel:
    model = session.get(SellableModel, model_id)
    if model is None:
        raise AppError(code="model_not_found", message="model not found", status_code=404)
    return model


def validate_batch_variant_keys(
    items: list[BatchVariantItem],
    *,
    valid_keys: Collection[tuple[str, str]],
) -> None:
    invalid_keys = [f"{item.size}×{item.quality}" for item in items if (item.size, item.quality) not in valid_keys]
    if invalid_keys:
        raise AppError(
            code="invalid_variant_key",
            message=f"invalid size×quality: {', '.join(invalid_keys[:5])}",
            status_code=422,
        )


def list_variants_by_key(session: Session, *, model_id: int) -> dict[tuple[str, str], ModelVariant]:
    existing = list(session.execute(select(ModelVariant).where(ModelVariant.model_id == model_id)).scalars())
    return {(variant.size, variant.quality): variant for variant in existing}


def upsert_batch_variant(
    session: Session,
    *,
    model_id: int,
    item: BatchVariantItem,
    existing_map: dict[tuple[str, str], ModelVariant],
) -> ModelVariant:
    variant = existing_map.get((item.size, item.quality)) or build_manual_variant(model_id=model_id, item=item)
    apply_manual_variant_payload(variant, item=item)
    if variant.id is None:
        session.add(variant)
    return variant


def build_manual_variant(*, model_id: int, item: BatchVariantItem) -> ModelVariant:
    return ModelVariant(model_id=model_id, size=item.size, quality=item.quality)


def apply_manual_variant_payload(variant: ModelVariant, *, item: BatchVariantItem) -> None:
    member_price_cents = resolve_margin_price(item)
    variant.upstream_provider_model = item.upstream_provider_model.strip() if item.upstream_provider_model else None
    variant.upstream_cost_credits = item.upstream_cost_credits
    variant.upstream_cost_cents = item.upstream_cost_cents
    variant.member_price_credits = cents_to_price_credits(member_price_cents)
    variant.member_price_cents = member_price_cents
    variant.anonymous_price_cents = item.anonymous_price_cents
    variant.profit_margin_basis_points = item.profit_margin_basis_points
    variant.status = item.status
    variant.price_manually_set = True


def apply_default_variant_price(
    variant: ModelVariant,
    *,
    upstream_cost_credits: float,
    upstream_cost_cents: int,
    profit_margin_basis_points: int,
) -> None:
    member_price_cents = apply_profit_margin(upstream_cost_cents, profit_margin_basis_points)
    variant.upstream_cost_credits = upstream_cost_credits
    variant.upstream_cost_cents = upstream_cost_cents
    variant.member_price_credits = cents_to_price_credits(member_price_cents)
    variant.member_price_cents = member_price_cents
    variant.profit_margin_basis_points = profit_margin_basis_points


def apply_default_variant_prices(
    session: Session,
    *,
    model_id: int,
    defaults: list[object],
    force: bool,
    profit_margin_basis_points: int,
) -> tuple[list[ModelVariant], int]:
    existing_map = list_variants_by_key(session, model_id=model_id)
    results: list[ModelVariant] = []
    skipped = 0
    for default_price in defaults:
        variant = existing_map.get((default_price.size, default_price.quality))
        if variant is not None and variant.price_manually_set and not force:
            skipped += 1
            results.append(variant)
            continue
        results.append(resolve_default_variant(session, model_id, variant, default_price, profit_margin_basis_points))
    return results, skipped


def resolve_default_variant(
    session: Session,
    model_id: int,
    variant: ModelVariant | None,
    default_price: object,
    profit_margin_basis_points: int,
) -> ModelVariant:
    target = variant or ModelVariant(model_id=model_id, size=default_price.size, quality=default_price.quality)
    apply_default_variant_price(
        target,
        upstream_cost_credits=default_price.price_credits,
        upstream_cost_cents=default_price.price_cents,
        profit_margin_basis_points=profit_margin_basis_points,
    )
    target.price_manually_set = False
    target.anonymous_price_cents = 0
    target.status = "active"
    if variant is None:
        session.add(target)
    return target
