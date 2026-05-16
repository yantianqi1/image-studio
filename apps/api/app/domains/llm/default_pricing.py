"""Default cost matrix for gpt-image-2 model variants."""
from __future__ import annotations

from dataclasses import dataclass

from apps.api.app.domains.billing.credits import (
    DEFAULT_PROFIT_MARGIN_BASIS_POINTS,
    SITE_CREDIT_CENTS,
    apply_profit_margin,
    cents_to_price_credits,
    price_credits_to_cents,
)
from apps.api.app.domains.llm.variant_matrix import ALL_SIZES, SizeDefinition


_SQUARE_PRICES: dict[str, dict[str, float]] = {
    "standard": {"low": 0.05, "medium": 0.40, "high": 1.58},
    "hd": {"low": 0.07, "medium": 0.60, "high": 2.37},
    "2k": {"low": 0.12, "medium": 1.00, "high": 3.95},
    "4k": {"low": 0.18, "medium": 1.59, "high": 6.32},
}

_NON_SQUARE_PRICES: dict[str, dict[str, float]] = {
    "standard": {"low": 0.04, "medium": 0.31, "high": 1.24},
    "hd": {"low": 0.06, "medium": 0.47, "high": 1.86},
    "2k": {"low": 0.10, "medium": 0.77, "high": 3.09},
    "4k": {"low": 0.15, "medium": 1.23, "high": 4.94},
}

SURCHARGE_REFERENCE_IMAGE_CREDITS = 0.20
SURCHARGE_EDIT_CREDITS = 0.30
SURCHARGE_PARTIAL_PREVIEW_CREDITS = 0.03


@dataclass(frozen=True)
class VariantDefaultPrice:
    size: str
    quality: str
    aspect_ratio: str
    tier: str
    price_credits: float
    price_cents: int


def _is_square(sd: SizeDefinition) -> bool:
    return sd.aspect_ratio == "1:1"


def get_default_price_credits(aspect_ratio: str, tier: str, quality: str) -> float:
    is_square = aspect_ratio == "1:1"
    table = _SQUARE_PRICES if is_square else _NON_SQUARE_PRICES
    return table[tier][quality]


def build_all_default_prices() -> list[VariantDefaultPrice]:
    results: list[VariantDefaultPrice] = []
    qualities = ("low", "medium", "high")
    for sd in ALL_SIZES:
        for q in qualities:
            credits = get_default_price_credits(sd.aspect_ratio, sd.tier, q)
            results.append(VariantDefaultPrice(
                size=sd.size,
                quality=q,
                aspect_ratio=sd.aspect_ratio,
                tier=sd.tier,
                price_credits=credits,
                price_cents=price_credits_to_cents(credits),
            ))
    return results
