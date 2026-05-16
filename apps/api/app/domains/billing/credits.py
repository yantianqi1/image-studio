from __future__ import annotations

import math

SITE_CREDIT_CENTS = 10
BASIS_POINTS_DENOMINATOR = 10000
DEFAULT_PROFIT_MARGIN_BASIS_POINTS = 3000


def price_credits_to_cents(credits: float) -> int:
    return math.ceil(credits * SITE_CREDIT_CENTS)


def cents_to_price_credits(cents: int) -> float:
    credits = cents / SITE_CREDIT_CENTS
    return int(credits) if credits.is_integer() else round(credits, 2)


def apply_profit_margin(cost_cents: int, profit_margin_basis_points: int) -> int:
    numerator = cost_cents * (BASIS_POINTS_DENOMINATOR + profit_margin_basis_points)
    return (numerator + BASIS_POINTS_DENOMINATOR - 1) // BASIS_POINTS_DENOMINATOR
