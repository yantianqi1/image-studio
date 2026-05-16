import math

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.llm.default_pricing import cents_to_price_credits
from apps.api.app.domains.llm.models import ModelVariant, Provider, SellableModel
from apps.api.app.domains.llm.openrouter_image_options import OPENROUTER_SIZE_TO_ASPECT_RATIO


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
        "member_price_credits": cents_to_price_credits(model.member_price_cents),
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
        "upstream_cost_credits": variant.upstream_cost_credits,
        "upstream_cost_cents": variant.upstream_cost_cents,
        "member_price_credits": variant.member_price_credits,
        "member_price_cents": variant.member_price_cents,
        "anonymous_price_cents": variant.anonymous_price_cents,
        "profit_margin_basis_points": variant.profit_margin_basis_points,
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
        "upstream_cost_credits": variant.upstream_cost_credits,
        "upstream_cost_cents": variant.upstream_cost_cents,
        "member_price_credits": variant.member_price_credits,
        "member_price_cents": variant.member_price_cents,
        "anonymous_price_cents": variant.anonymous_price_cents,
        "profit_margin_basis_points": variant.profit_margin_basis_points,
        "price_manually_set": variant.price_manually_set,
        "status": variant.status,
        "created_at": variant.created_at.isoformat() if variant.created_at else None,
    }
