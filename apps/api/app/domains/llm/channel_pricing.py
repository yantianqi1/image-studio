from __future__ import annotations

from dataclasses import dataclass

from apps.api.app.domains.llm.default_pricing import build_all_default_prices


@dataclass(frozen=True)
class CatalogVariantSeed:
    size: str
    quality: str
    member_price_cents: int
    anonymous_price_cents: int = 0
    upstream_provider_model: str | None = None
    status: str = "active"


OFFICIAL_GPT_IMAGE_2_VARIANTS: tuple[CatalogVariantSeed, ...] = (
    CatalogVariantSeed(size="1024x1024", quality="low", member_price_cents=20),
    CatalogVariantSeed(size="1024x1024", quality="medium", member_price_cents=130),
    CatalogVariantSeed(size="1024x1024", quality="high", member_price_cents=480),
    CatalogVariantSeed(size="1024x1536", quality="low", member_price_cents=20),
    CatalogVariantSeed(size="1024x1536", quality="medium", member_price_cents=100),
    CatalogVariantSeed(size="1024x1536", quality="high", member_price_cents=370),
    CatalogVariantSeed(size="1536x1024", quality="low", member_price_cents=20),
    CatalogVariantSeed(size="1536x1024", quality="medium", member_price_cents=100),
    CatalogVariantSeed(size="1536x1024", quality="high", member_price_cents=370),
)

OPENROUTER_LOW_PRICE_CENTS = 80
OPENROUTER_MEDIUM_PRICE_CENTS = 150
OPENROUTER_HIGH_PRICE_CENTS = 300
OPENROUTER_IMAGE_SIZES = (
    "1024x1024",
    "1248x832",
    "832x1248",
    "1184x864",
    "864x1184",
    "1152x896",
    "896x1152",
    "1344x768",
    "768x1344",
    "1536x672",
)
OPENROUTER_QUALITY_PRICES = {
    "low": OPENROUTER_LOW_PRICE_CENTS,
    "medium": OPENROUTER_MEDIUM_PRICE_CENTS,
    "high": OPENROUTER_HIGH_PRICE_CENTS,
}


def build_lowcost_image_variant_seeds() -> list[CatalogVariantSeed]:
    return [
        CatalogVariantSeed(
            size=price.size,
            quality=price.quality,
            member_price_cents=price.price_cents,
            anonymous_price_cents=0,
        )
        for price in build_all_default_prices()
    ]


def build_openrouter_image_variant_seeds() -> list[CatalogVariantSeed]:
    return [
        CatalogVariantSeed(size=size, quality=quality, member_price_cents=price_cents)
        for size in OPENROUTER_IMAGE_SIZES
        for quality, price_cents in OPENROUTER_QUALITY_PRICES.items()
    ]
