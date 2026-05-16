from __future__ import annotations

from dataclasses import dataclass

from apps.api.app.domains.llm.default_pricing import (
    DEFAULT_PROFIT_MARGIN_BASIS_POINTS,
    apply_profit_margin,
    cents_to_price_credits,
    build_all_default_prices,
)
from apps.api.app.domains.llm.openrouter_image_options import OPENROUTER_IMAGE_SIZES


@dataclass(frozen=True)
class CatalogVariantSeed:
    size: str
    quality: str
    member_price_cents: int
    member_price_credits: float | None = None
    upstream_cost_cents: int | None = None
    upstream_cost_credits: float | None = None
    profit_margin_basis_points: int = DEFAULT_PROFIT_MARGIN_BASIS_POINTS
    anonymous_price_cents: int = 0
    upstream_provider_model: str | None = None
    status: str = "active"


def build_margin_variant_seed(
    *,
    size: str,
    quality: str,
    upstream_cost_cents: int,
    upstream_cost_credits: float | None = None,
    profit_margin_basis_points: int = DEFAULT_PROFIT_MARGIN_BASIS_POINTS,
) -> CatalogVariantSeed:
    member_price_cents = apply_profit_margin(upstream_cost_cents, profit_margin_basis_points)
    return CatalogVariantSeed(
        size=size,
        quality=quality,
        member_price_cents=member_price_cents,
        member_price_credits=cents_to_price_credits(member_price_cents),
        upstream_cost_cents=upstream_cost_cents,
        upstream_cost_credits=upstream_cost_credits or cents_to_price_credits(upstream_cost_cents),
        profit_margin_basis_points=profit_margin_basis_points,
    )


OFFICIAL_GPT_IMAGE_2_VARIANTS: tuple[CatalogVariantSeed, ...] = (
    build_margin_variant_seed(size="1024x1024", quality="low", upstream_cost_cents=20),
    build_margin_variant_seed(size="1024x1024", quality="medium", upstream_cost_cents=130),
    build_margin_variant_seed(size="1024x1024", quality="high", upstream_cost_cents=480),
    build_margin_variant_seed(size="1024x1536", quality="low", upstream_cost_cents=20),
    build_margin_variant_seed(size="1024x1536", quality="medium", upstream_cost_cents=100),
    build_margin_variant_seed(size="1024x1536", quality="high", upstream_cost_cents=370),
    build_margin_variant_seed(size="1536x1024", quality="low", upstream_cost_cents=20),
    build_margin_variant_seed(size="1536x1024", quality="medium", upstream_cost_cents=100),
    build_margin_variant_seed(size="1536x1024", quality="high", upstream_cost_cents=370),
)

OPENROUTER_LOW_PRICE_CENTS = 80
OPENROUTER_MEDIUM_PRICE_CENTS = 150
OPENROUTER_HIGH_PRICE_CENTS = 300
OPENROUTER_QUALITY_PRICES = {
    "low": OPENROUTER_LOW_PRICE_CENTS,
    "medium": OPENROUTER_MEDIUM_PRICE_CENTS,
    "high": OPENROUTER_HIGH_PRICE_CENTS,
}


def build_lowcost_image_variant_seeds() -> list[CatalogVariantSeed]:
    return [
        build_margin_variant_seed(
            size=price.size,
            quality=price.quality,
            upstream_cost_cents=price.price_cents,
            upstream_cost_credits=price.price_credits,
        )
        for price in build_all_default_prices()
    ]


def build_openrouter_image_variant_seeds() -> list[CatalogVariantSeed]:
    return [
        build_margin_variant_seed(size=size, quality=quality, upstream_cost_cents=price_cents)
        for size in OPENROUTER_IMAGE_SIZES
        for quality, price_cents in OPENROUTER_QUALITY_PRICES.items()
    ]
