import math

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.deps import get_db_session
from apps.api.app.core.errors import AppError
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.service import require_admin
from apps.api.app.domains.llm.admin_ops import delete_provider, delete_sellable_model
from apps.api.app.domains.llm.models import Provider, SellableModel, ModelVariant
from apps.api.app.domains.llm.openrouter_image_options import OPENROUTER_SIZE_TO_ASPECT_RATIO
from apps.api.app.domains.llm.service import (
    create_or_update_sellable_model,
    create_provider,
    fetch_upstream_models,
    import_upstream_models,
    list_admin_models,
    list_providers,
    list_public_models,
)

public_router = APIRouter(tags=["llm-public"])
admin_router = APIRouter(tags=["llm-admin"])
provider_admin_router = APIRouter(prefix="/providers", tags=["llm-admin-providers"])
model_admin_router = APIRouter(prefix="/models", tags=["llm-admin-models"])


class CreateProviderRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    type: str = Field(min_length=1, max_length=64)
    base_url: str | None = Field(default=None, max_length=255)
    api_key_env: str | None = Field(default=None, max_length=128)
    default_model: str | None = Field(default=None, max_length=128)


class CreateSellableModelRequest(BaseModel):
    code: str = Field(min_length=1, max_length=128)
    display_name: str = Field(min_length=1, max_length=128)
    capability: str = Field(min_length=1, max_length=32)
    provider_id: int = Field(ge=1)
    provider_model: str = Field(min_length=1, max_length=128)
    public_enabled: bool
    member_price_cents: int = Field(ge=0)
    anonymous_price_cents: int = Field(ge=0)


class UpdateSellableModelRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=128)
    capability: str = Field(min_length=1, max_length=32)
    provider_id: int = Field(ge=1)
    provider_model: str = Field(min_length=1, max_length=128)
    public_enabled: bool
    member_price_cents: int = Field(ge=0)
    anonymous_price_cents: int = Field(ge=0)


class FetchUpstreamModelsRequest(BaseModel):
    url: str = Field(min_length=1, max_length=512)
    api_key_env: str | None = Field(default=None, max_length=128)


class ImportUpstreamModelsRequest(BaseModel):
    url: str = Field(min_length=1, max_length=512)
    api_key_env: str | None = Field(default=None, max_length=128)
    provider_id: int = Field(ge=1)
    model_ids: list[str] = Field(min_length=1, max_length=100)
    capability: str = Field(min_length=1, max_length=32)
    public_enabled: bool
    member_price_cents: int = Field(ge=0)
    anonymous_price_cents: int = Field(ge=0)


class CreateModelVariantRequest(BaseModel):
    size: str = Field(min_length=1, max_length=64)
    quality: str = Field(min_length=1, max_length=32, pattern="^(low|medium|high)$")
    upstream_provider_model: str | None = Field(default=None, max_length=128)
    member_price_cents: int = Field(ge=0)
    anonymous_price_cents: int = Field(ge=0, default=0)


class UpdateModelVariantRequest(BaseModel):
    upstream_provider_model: str | None = Field(default=None, max_length=128)
    member_price_cents: int = Field(ge=0)
    anonymous_price_cents: int = Field(ge=0, default=0)
    status: str = Field(default="active", pattern="^(active|disabled)$")


class BatchVariantItem(BaseModel):
    size: str = Field(min_length=1, max_length=64)
    quality: str = Field(pattern="^(low|medium|high)$")
    upstream_provider_model: str | None = Field(default=None, max_length=128)
    member_price_cents: int = Field(ge=0)
    anonymous_price_cents: int = Field(ge=0, default=0)
    status: str = Field(default="active", pattern="^(active|disabled)$")


class BatchUpsertVariantsRequest(BaseModel):
    variants: list[BatchVariantItem] = Field(min_length=1, max_length=84)


@public_router.get("/models")
def get_models(session: Session = Depends(get_db_session)):
    models = list_public_models(session)
    variants_by_model_id = list_public_model_variants(session, model_ids=[model.id for model in models])
    payloads = [
        sellable_model_payload(model, variants=variants_by_model_id.get(model.id, []))
        for model in models
    ]
    session.commit()
    return api_ok(payloads)


@provider_admin_router.get("")
def get_provider_list(request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    providers = [provider_payload(provider) for provider in list_providers(session)]
    session.commit()
    return api_ok(providers)


@provider_admin_router.post("", status_code=status.HTTP_201_CREATED)
def create_provider_route(
    payload: CreateProviderRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    provider = create_provider(
        session,
        name=payload.name,
        provider_type=payload.type,
        base_url=payload.base_url,
        api_key_env=payload.api_key_env,
        default_model=payload.default_model,
    )
    session.commit()
    return api_ok(provider_payload(provider))


@provider_admin_router.delete("/{provider_id}")
def delete_provider_route(
    provider_id: int,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    delete_provider(session, provider_id=provider_id)
    session.commit()
    return api_ok({"deleted": True})


@model_admin_router.get("")
def get_admin_models(request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    models = [sellable_model_payload(model) for model in list_admin_models(session)]
    session.commit()
    return api_ok(models)


@model_admin_router.post("", status_code=status.HTTP_201_CREATED)
def create_sellable_model_route(
    payload: CreateSellableModelRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    model, _ = create_or_update_sellable_model(
        session,
        code=payload.code,
        display_name=payload.display_name,
        capability=payload.capability,
        provider_id=payload.provider_id,
        provider_model=payload.provider_model,
        public_enabled=payload.public_enabled,
        member_price_cents=payload.member_price_cents,
        anonymous_price_cents=payload.anonymous_price_cents,
    )
    session.commit()
    return api_ok(sellable_model_payload(model))


@model_admin_router.post("/upstream")
def fetch_upstream_models_route(
    payload: FetchUpstreamModelsRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    models = fetch_upstream_models(url=payload.url, api_key_env=payload.api_key_env)
    return api_ok([upstream_model_payload(model) for model in models])


@model_admin_router.post("/import-upstream", status_code=status.HTTP_201_CREATED)
def import_upstream_models_route(
    payload: ImportUpstreamModelsRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    models = import_upstream_models(
        session,
        url=payload.url,
        api_key_env=payload.api_key_env,
        provider_id=payload.provider_id,
        model_ids=payload.model_ids,
        capability=payload.capability,
        public_enabled=payload.public_enabled,
        member_price_cents=payload.member_price_cents,
        anonymous_price_cents=payload.anonymous_price_cents,
    )
    session.commit()
    return api_ok([sellable_model_payload(model) for model in models])


@model_admin_router.get("/{model_id}/variants")
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


@model_admin_router.post("/{model_id}/variants", status_code=status.HTTP_201_CREATED)
def create_model_variant(
    model_id: int,
    payload: CreateModelVariantRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    model = session.get(SellableModel, model_id)
    if model is None:
        raise AppError(code="model_not_found", message="model not found", status_code=404)
    existing = session.execute(
        select(ModelVariant).where(
            ModelVariant.model_id == model_id,
            ModelVariant.size == payload.size,
            ModelVariant.quality == payload.quality,
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise AppError(code="variant_exists", message="variant already exists for this size+quality", status_code=409)
    variant = ModelVariant(
        model_id=model_id,
        size=payload.size.strip(),
        quality=payload.quality.strip(),
        upstream_provider_model=payload.upstream_provider_model.strip() if payload.upstream_provider_model else None,
        member_price_cents=payload.member_price_cents,
        anonymous_price_cents=payload.anonymous_price_cents,
        price_manually_set=True,
    )
    session.add(variant)
    session.flush()
    session.commit()
    return api_ok(variant_payload(variant))


@model_admin_router.put("/{model_id}/variants/{variant_id}")
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
    variant.upstream_provider_model = payload.upstream_provider_model.strip() if payload.upstream_provider_model else None
    variant.member_price_cents = payload.member_price_cents
    variant.anonymous_price_cents = payload.anonymous_price_cents
    variant.status = payload.status
    variant.price_manually_set = True
    session.flush()
    session.commit()
    return api_ok(variant_payload(variant))


@model_admin_router.delete("/{model_id}/variants/{variant_id}")
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


@model_admin_router.get("/{model_id}/variant-matrix")
def get_variant_matrix(
    model_id: int,
    request: Request,
    session: Session = Depends(get_db_session),
):
    from apps.api.app.domains.llm.variant_matrix import ALL_SIZES, ASPECT_RATIOS, QUALITY_OPTIONS

    require_admin(request, session)
    model = session.get(SellableModel, model_id)
    if model is None:
        raise AppError(code="model_not_found", message="model not found", status_code=404)
    existing = list(
        session.execute(
            select(ModelVariant).where(ModelVariant.model_id == model_id)
        ).scalars()
    )
    existing_map: dict[tuple[str, str], ModelVariant] = {
        (v.size, v.quality): v for v in existing
    }
    groups = []
    for ar in ASPECT_RATIOS:
        tiers = []
        for sd in ALL_SIZES:
            if sd.aspect_ratio != ar:
                continue
            variants = []
            for q in QUALITY_OPTIONS:
                v = existing_map.get((sd.size, q))
                variants.append({
                    "quality": q,
                    "id": v.id if v else None,
                    "upstream_provider_model": v.upstream_provider_model if v else None,
                    "member_price_cents": v.member_price_cents if v else None,
                    "anonymous_price_cents": v.anonymous_price_cents if v else None,
                    "status": v.status if v else None,
                })
            tiers.append({"tier": sd.tier, "size": sd.size, "variants": variants})
        groups.append({"aspect_ratio": ar, "tiers": tiers})
    session.commit()
    return api_ok({"model_id": model_id, "groups": groups})


@model_admin_router.post("/{model_id}/variants/batch")
def batch_upsert_variants(
    model_id: int,
    payload: BatchUpsertVariantsRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    from apps.api.app.domains.llm.variant_matrix import ALL_VARIANT_KEYS

    require_admin(request, session)
    model = session.get(SellableModel, model_id)
    if model is None:
        raise AppError(code="model_not_found", message="model not found", status_code=404)
    invalid_keys = [
        f"{item.size}×{item.quality}"
        for item in payload.variants
        if (item.size, item.quality) not in ALL_VARIANT_KEYS
    ]
    if invalid_keys:
        raise AppError(
            code="invalid_variant_key",
            message=f"invalid size×quality: {', '.join(invalid_keys[:5])}",
            status_code=422,
        )
    existing = list(
        session.execute(
            select(ModelVariant).where(ModelVariant.model_id == model_id)
        ).scalars()
    )
    existing_map: dict[tuple[str, str], ModelVariant] = {
        (v.size, v.quality): v for v in existing
    }
    results = []
    for item in payload.variants:
        upstream = item.upstream_provider_model.strip() if item.upstream_provider_model else None
        v = existing_map.get((item.size, item.quality))
        if v is not None:
            v.upstream_provider_model = upstream
            v.member_price_cents = item.member_price_cents
            v.anonymous_price_cents = item.anonymous_price_cents
            v.status = item.status
            v.price_manually_set = True
        else:
            v = ModelVariant(
                model_id=model_id,
                size=item.size,
                quality=item.quality,
                upstream_provider_model=upstream,
                member_price_cents=item.member_price_cents,
                anonymous_price_cents=item.anonymous_price_cents,
                status=item.status,
                price_manually_set=True,
            )
            session.add(v)
        results.append(v)
    session.flush()
    session.commit()
    return api_ok([variant_payload(v) for v in results])


class ApplyDefaultPricingRequest(BaseModel):
    force: bool = Field(default=False)


@model_admin_router.post("/{model_id}/variants/apply-default-pricing")
def apply_default_pricing(
    model_id: int,
    payload: ApplyDefaultPricingRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    from apps.api.app.domains.llm.default_pricing import build_all_default_prices, price_credits_to_cents

    require_admin(request, session)
    model = session.get(SellableModel, model_id)
    if model is None:
        raise AppError(code="model_not_found", message="model not found", status_code=404)

    defaults = build_all_default_prices()
    existing = list(
        session.execute(
            select(ModelVariant).where(ModelVariant.model_id == model_id)
        ).scalars()
    )
    existing_map: dict[tuple[str, str], ModelVariant] = {
        (v.size, v.quality): v for v in existing
    }

    results = []
    skipped = 0
    for dp in defaults:
        v = existing_map.get((dp.size, dp.quality))
        if v is not None:
            if v.price_manually_set and not payload.force:
                skipped += 1
                results.append(v)
                continue
            v.member_price_credits = dp.price_credits
            v.member_price_cents = dp.price_cents
            if not payload.force:
                v.price_manually_set = False
        else:
            v = ModelVariant(
                model_id=model_id,
                size=dp.size,
                quality=dp.quality,
                member_price_credits=dp.price_credits,
                member_price_cents=dp.price_cents,
                anonymous_price_cents=0,
                price_manually_set=False,
                status="active",
            )
            session.add(v)
        results.append(v)

    session.flush()
    session.commit()
    return api_ok({
        "updated": len(results) - skipped,
        "skipped": skipped,
        "total": len(results),
        "variants": [variant_payload(v) for v in results],
    })


@model_admin_router.patch("/{model_code:path}")
def update_sellable_model_route(
    model_code: str,
    payload: UpdateSellableModelRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    model, _ = create_or_update_sellable_model(
        session,
        code=model_code,
        display_name=payload.display_name,
        capability=payload.capability,
        provider_id=payload.provider_id,
        provider_model=payload.provider_model,
        public_enabled=payload.public_enabled,
        member_price_cents=payload.member_price_cents,
        anonymous_price_cents=payload.anonymous_price_cents,
    )
    session.commit()
    return api_ok(sellable_model_payload(model))


@model_admin_router.delete("/{model_code:path}")
def delete_sellable_model_route(
    model_code: str,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    delete_sellable_model(session, model_code=model_code)
    session.commit()
    return api_ok({"deleted": True})


def provider_payload(provider: Provider) -> dict[str, object]:
    return {
        "id": provider.id,
        "name": provider.name,
        "type": provider.type,
        "base_url": provider.base_url,
        "api_key_env": provider.api_key_env,
        "default_model": provider.default_model,
        "status": provider.status,
    }


def sellable_model_payload(
    model: SellableModel,
    *,
    variants: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    payload = {
        "id": model.id,
        "code": model.code,
        "display_name": model.display_name,
        "capability": model.capability,
        "provider_id": model.provider_id,
        "provider_model": model.provider_model,
        "public_enabled": model.public_enabled,
        "member_price_cents": model.member_price_cents,
        "anonymous_price_cents": model.anonymous_price_cents,
    }
    if variants is not None:
        payload["variants"] = variants
    return payload


def list_public_model_variants(
    session: Session,
    *,
    model_ids: list[int],
) -> dict[int, list[dict[str, object]]]:
    if not model_ids:
        return {}
    statement = (
        select(ModelVariant)
        .where(ModelVariant.model_id.in_(model_ids), ModelVariant.status == "active")
        .order_by(ModelVariant.model_id.asc(), ModelVariant.size.asc(), ModelVariant.quality.asc())
    )
    variants_by_model_id: dict[int, list[dict[str, object]]] = {model_id: [] for model_id in model_ids}
    for variant in session.execute(statement).scalars():
        variants_by_model_id.setdefault(variant.model_id, []).append(public_variant_payload(variant))
    return variants_by_model_id


def public_variant_payload(variant: ModelVariant) -> dict[str, object]:
    return {
        "id": variant.id,
        "size": variant.size,
        "aspect_ratio": resolve_variant_aspect_ratio(variant.size),
        "quality": variant.quality,
        "member_price_cents": variant.member_price_cents,
        "anonymous_price_cents": variant.anonymous_price_cents,
    }


def resolve_variant_aspect_ratio(size: str) -> str:
    normalized = size.strip().lower()
    mapped_ratio = OPENROUTER_SIZE_TO_ASPECT_RATIO.get(normalized)
    if mapped_ratio:
        return mapped_ratio
    width, height = parse_variant_size(normalized)
    divisor = math.gcd(width, height)
    return f"{width // divisor}:{height // divisor}"


def parse_variant_size(size: str) -> tuple[int, int]:
    parts = size.split("x", 1)
    if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
        return 1, 1
    width = int(parts[0])
    height = int(parts[1])
    if width <= 0 or height <= 0:
        return 1, 1
    return width, height


def upstream_model_payload(model: object) -> dict[str, object]:
    return {
        "id": getattr(model, "id"),
        "display_name": getattr(model, "display_name"),
    }


def variant_payload(variant: ModelVariant) -> dict[str, object]:
    return {
        "id": variant.id,
        "model_id": variant.model_id,
        "size": variant.size,
        "quality": variant.quality,
        "upstream_provider_model": variant.upstream_provider_model,
        "member_price_credits": variant.member_price_credits,
        "member_price_cents": variant.member_price_cents,
        "anonymous_price_cents": variant.anonymous_price_cents,
        "price_manually_set": variant.price_manually_set,
        "status": variant.status,
        "created_at": variant.created_at.isoformat() if variant.created_at else None,
    }


admin_router.include_router(provider_admin_router)
admin_router.include_router(model_admin_router)
