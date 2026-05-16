from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.deps import get_db_session
from apps.api.app.core.errors import AppError
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.service import require_admin
from apps.api.app.domains.llm.default_pricing import build_all_default_prices, cents_to_price_credits
from apps.api.app.domains.llm.models import ModelVariant
from apps.api.app.domains.llm.route_payloads import variant_payload
from apps.api.app.domains.llm.route_schemas import (
    ApplyDefaultPricingRequest,
    BatchUpsertVariantsRequest,
    CreateModelVariantRequest,
    UpdateModelVariantRequest,
)
from apps.api.app.domains.llm.variant_ops import (
    apply_default_variant_prices,
    list_variants_by_key,
    require_model,
    resolve_margin_price,
    upsert_batch_variant,
    validate_batch_variant_keys,
)
from apps.api.app.domains.llm.variant_matrix import ALL_SIZES, ALL_VARIANT_KEYS, ASPECT_RATIOS, QUALITY_OPTIONS

variant_router = APIRouter(tags=["llm-admin-models"])


@variant_router.get("/{model_id}/variants")
def list_model_variants(
    model_id: int,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    variants = list(
        session.execute(
            select(ModelVariant)
            .where(ModelVariant.model_id == model_id)
            .order_by(ModelVariant.size.asc(), ModelVariant.quality.asc())
        ).scalars()
    )
    session.commit()
    return api_ok([variant_payload(v) for v in variants])


@variant_router.post("/{model_id}/variants", status_code=status.HTTP_201_CREATED)
def create_model_variant(
    model_id: int,
    payload: CreateModelVariantRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    require_model(session, model_id=model_id)
    existing = session.execute(
        select(ModelVariant).where(
            ModelVariant.model_id == model_id,
            ModelVariant.size == payload.size,
            ModelVariant.quality == payload.quality,
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise AppError(code="variant_exists", message="variant already exists for this size+quality", status_code=409)
    variant = build_model_variant(model_id=model_id, payload=payload)
    session.add(variant)
    session.flush()
    session.commit()
    return api_ok(variant_payload(variant))


def build_model_variant(*, model_id: int, payload: CreateModelVariantRequest) -> ModelVariant:
    member_price_cents = resolve_margin_price(payload)
    return ModelVariant(
        model_id=model_id,
        size=payload.size.strip(),
        quality=payload.quality.strip(),
        upstream_provider_model=payload.upstream_provider_model.strip() if payload.upstream_provider_model else None,
        upstream_cost_credits=payload.upstream_cost_credits,
        upstream_cost_cents=payload.upstream_cost_cents,
        member_price_credits=cents_to_price_credits(member_price_cents),
        member_price_cents=member_price_cents,
        anonymous_price_cents=payload.anonymous_price_cents,
        profit_margin_basis_points=payload.profit_margin_basis_points,
        price_manually_set=True,
    )


@variant_router.put("/{model_id}/variants/{variant_id}")
def update_model_variant(
    model_id: int,
    variant_id: int,
    payload: UpdateModelVariantRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    variant = session.get(ModelVariant, variant_id)
    if variant is None or variant.model_id != model_id:
        raise AppError(code="variant_not_found", message="variant not found", status_code=404)
    update_model_variant_fields(variant, payload=payload)
    session.flush()
    session.commit()
    return api_ok(variant_payload(variant))


def update_model_variant_fields(variant: ModelVariant, *, payload: UpdateModelVariantRequest) -> None:
    member_price_cents = resolve_margin_price(payload)
    variant.upstream_provider_model = payload.upstream_provider_model.strip() if payload.upstream_provider_model else None
    variant.upstream_cost_credits = payload.upstream_cost_credits
    variant.upstream_cost_cents = payload.upstream_cost_cents
    variant.member_price_credits = cents_to_price_credits(member_price_cents)
    variant.member_price_cents = member_price_cents
    variant.anonymous_price_cents = payload.anonymous_price_cents
    variant.profit_margin_basis_points = payload.profit_margin_basis_points
    variant.status = payload.status
    variant.price_manually_set = True


@variant_router.delete("/{model_id}/variants/{variant_id}")
def delete_model_variant(
    model_id: int,
    variant_id: int,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    variant = session.get(ModelVariant, variant_id)
    if variant is None or variant.model_id != model_id:
        raise AppError(code="variant_not_found", message="variant not found", status_code=404)
    session.delete(variant)
    session.flush()
    session.commit()
    return api_ok({"deleted": True})


@variant_router.get("/{model_id}/variant-matrix")
def get_variant_matrix(
    model_id: int,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    require_model(session, model_id=model_id)
    existing_map = list_variants_by_key(session, model_id=model_id)
    groups = [variant_matrix_group(aspect_ratio, existing_map) for aspect_ratio in ASPECT_RATIOS]
    session.commit()
    return api_ok({"model_id": model_id, "groups": groups})


def variant_matrix_group(aspect_ratio: str, existing_map: dict[tuple[str, str], ModelVariant]) -> dict[str, object]:
    tiers = [
        {"tier": size_def.tier, "size": size_def.size, "variants": matrix_variants(size_def.size, existing_map)}
        for size_def in ALL_SIZES
        if size_def.aspect_ratio == aspect_ratio
    ]
    return {"aspect_ratio": aspect_ratio, "tiers": tiers}


def matrix_variants(size: str, existing_map: dict[tuple[str, str], ModelVariant]) -> list[dict[str, object]]:
    return [matrix_variant_payload(quality, existing_map.get((size, quality))) for quality in QUALITY_OPTIONS]


def matrix_variant_payload(quality: str, variant: ModelVariant | None) -> dict[str, object]:
    return {
        "quality": quality,
        "id": variant.id if variant else None,
        "upstream_provider_model": variant.upstream_provider_model if variant else None,
        "upstream_cost_credits": variant.upstream_cost_credits if variant else None,
        "upstream_cost_cents": variant.upstream_cost_cents if variant else None,
        "member_price_credits": variant.member_price_credits if variant else None,
        "member_price_cents": variant.member_price_cents if variant else None,
        "anonymous_price_cents": variant.anonymous_price_cents if variant else None,
        "profit_margin_basis_points": variant.profit_margin_basis_points if variant else None,
        "status": variant.status if variant else None,
    }


@variant_router.post("/{model_id}/variants/batch")
def batch_upsert_variants(
    model_id: int,
    payload: BatchUpsertVariantsRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    require_model(session, model_id=model_id)
    validate_batch_variant_keys(payload.variants, valid_keys=ALL_VARIANT_KEYS)
    existing_map = list_variants_by_key(session, model_id=model_id)
    results = [
        upsert_batch_variant(session, model_id=model_id, item=item, existing_map=existing_map)
        for item in payload.variants
    ]
    session.flush()
    session.commit()
    return api_ok([variant_payload(v) for v in results])


@variant_router.post("/{model_id}/variants/apply-default-pricing")
def apply_default_pricing(
    model_id: int,
    payload: ApplyDefaultPricingRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    require_model(session, model_id=model_id)
    results, skipped = apply_default_variant_prices(
        session,
        model_id=model_id,
        defaults=build_all_default_prices(),
        force=payload.force,
        profit_margin_basis_points=payload.profit_margin_basis_points,
    )

    session.flush()
    session.commit()
    return api_ok({
        "updated": len(results) - skipped,
        "skipped": skipped,
        "total": len(results),
        "variants": [variant_payload(v) for v in results],
    })
