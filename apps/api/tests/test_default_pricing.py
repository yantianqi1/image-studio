"""Tests for default pricing of gpt-image-2 model variants."""
from __future__ import annotations

from fastapi.testclient import TestClient

from apps.api.app.domains.llm.default_pricing import (
    DEFAULT_PROFIT_MARGIN_BASIS_POINTS,
    SURCHARGE_EDIT_CREDITS,
    SURCHARGE_PARTIAL_PREVIEW_CREDITS,
    SURCHARGE_REFERENCE_IMAGE_CREDITS,
    apply_profit_margin,
    build_all_default_prices,
    get_default_price_credits,
    price_credits_to_cents,
)
from apps.api.app.domains.llm.variant_matrix import ALL_SIZES, QUALITY_OPTIONS
from apps.api.app.infra.db.session import initialize_database
from apps.api.app.main import create_app


def build_client() -> TestClient:
    initialize_database()
    return TestClient(create_app())


def setup_admin_and_model(client: TestClient) -> int:
    from apps.api.app.domains.auth.service import create_admin_account
    from apps.api.app.infra.db.session import session_scope

    with session_scope() as session:
        create_admin_account(session=session, username="root", password="admin-pass")
    client.post("/api/admin/auth/login", json={"username": "root", "password": "admin-pass"})
    client.post("/api/admin/providers", json={
        "name": "test-provider",
        "type": "openai-compatible",
        "base_url": "https://example.test/v1",
        "api_key_env": "TEST_KEY",
        "default_model": "gpt-image-2",
    })
    resp = client.post("/api/admin/models", json={
        "code": "gpt-image-2",
        "display_name": "GPT Image 2",
        "capability": "image",
        "provider_id": 1,
        "provider_model": "gpt-image-2",
        "public_enabled": True,
        "member_price_cents": 10,
        "anonymous_price_cents": 0,
    })
    assert resp.status_code == 201
    return resp.json()["data"]["id"]


# --- Unit tests for pricing logic ---


class TestBuildAllDefaultPrices:
    def test_produces_84_combinations(self):
        prices = build_all_default_prices()
        assert len(prices) == 84

    def test_square_uses_square_prices(self):
        prices = build_all_default_prices()
        square_prices = [p for p in prices if p.aspect_ratio == "1:1"]
        assert len(square_prices) == 12  # 4 tiers * 3 qualities
        # 1:1 standard medium should be 0.40
        p = next(p for p in square_prices if p.tier == "standard" and p.quality == "medium")
        assert p.price_credits == 0.40

    def test_non_square_uses_non_square_prices(self):
        prices = build_all_default_prices()
        # 16:9 is non-square
        p_16_9 = [p for p in prices if p.aspect_ratio == "16:9"]
        assert len(p_16_9) == 12
        p = next(p for p in p_16_9 if p.tier == "standard" and p.quality == "medium")
        assert p.price_credits == 0.31

    def test_all_non_1_1_ratios_use_non_square(self):
        prices = build_all_default_prices()
        non_square_ratios = {"3:2", "16:9", "21:9", "9:16", "4:3", "3:4"}
        for p in prices:
            if p.aspect_ratio in non_square_ratios:
                expected = get_default_price_credits(p.aspect_ratio, p.tier, p.quality)
                assert p.price_credits == expected

    def test_price_cents_uses_site_credit_conversion(self):
        prices = build_all_default_prices()
        for p in prices:
            assert p.price_cents == price_credits_to_cents(p.price_credits)


class TestPriceCreditsToCents:
    def test_site_credits_use_ten_credits_per_yuan(self):
        assert price_credits_to_cents(10) == 100
        assert price_credits_to_cents(0.5) == 5

    def test_exact_values(self):
        assert price_credits_to_cents(0.05) == 1
        assert price_credits_to_cents(0.40) == 4
        assert price_credits_to_cents(1.58) == 16
        assert price_credits_to_cents(6.32) == 64

    def test_rounds_up(self):
        assert price_credits_to_cents(0.001) == 1
        assert price_credits_to_cents(0.011) == 1


class TestProfitMargin:
    def test_default_margin_is_30_percent(self):
        assert DEFAULT_PROFIT_MARGIN_BASIS_POINTS == 3000

    def test_applies_margin_with_integer_rounding(self):
        assert apply_profit_margin(40, DEFAULT_PROFIT_MARGIN_BASIS_POINTS) == 52
        assert apply_profit_margin(5, DEFAULT_PROFIT_MARGIN_BASIS_POINTS) == 7


class TestSurcharges:
    def test_reference_image_surcharge(self):
        assert SURCHARGE_REFERENCE_IMAGE_CREDITS == 0.20

    def test_edit_surcharge(self):
        assert SURCHARGE_EDIT_CREDITS == 0.30

    def test_partial_preview_surcharge(self):
        assert SURCHARGE_PARTIAL_PREVIEW_CREDITS == 0.03


# --- Integration tests for the apply-default-pricing endpoint ---


class TestApplyDefaultPricingEndpoint:
    def test_creates_all_84_variants(self, client):
        model_id = setup_admin_and_model(client)
        resp = client.post(f"/api/admin/models/{model_id}/variants/apply-default-pricing", json={"force": False})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total"] == 84
        assert data["updated"] == 84
        assert data["skipped"] == 0
        assert len(data["variants"]) == 84

    def test_sets_correct_credits_and_cents(self, client):
        model_id = setup_admin_and_model(client)
        resp = client.post(f"/api/admin/models/{model_id}/variants/apply-default-pricing", json={"force": False})
        variants = resp.json()["data"]["variants"]
        # Find 4096x4096 high (square, 4k, high) -> 6.32 credits, 64 cost cents, 84 sale cents.
        v = next(v for v in variants if v["size"] == "4096x4096" and v["quality"] == "high")
        assert v["upstream_cost_credits"] == 6.32
        assert v["upstream_cost_cents"] == 64
        assert v["member_price_cents"] == 84
        assert v["member_price_credits"] == 8.4
        assert v["profit_margin_basis_points"] == 3000

    def test_force_false_does_not_overwrite_manual_price(self, client):
        model_id = setup_admin_and_model(client)
        # Manually set a price via batch upsert (marks price_manually_set=True)
        client.post(f"/api/admin/models/{model_id}/variants/batch", json={
            "variants": [{"size": "1024x1024", "quality": "low", "member_price_cents": 999, "anonymous_price_cents": 0}]
        })
        # Apply defaults without force
        resp = client.post(f"/api/admin/models/{model_id}/variants/apply-default-pricing", json={"force": False})
        data = resp.json()["data"]
        assert data["skipped"] == 1
        # The manually set variant should keep its price
        v = next(v for v in data["variants"] if v["size"] == "1024x1024" and v["quality"] == "low")
        assert v["member_price_cents"] == 999

    def test_force_true_overwrites_manual_price(self, client):
        model_id = setup_admin_and_model(client)
        # Manually set a price
        client.post(f"/api/admin/models/{model_id}/variants/batch", json={
            "variants": [{"size": "1024x1024", "quality": "low", "member_price_cents": 999, "anonymous_price_cents": 0}]
        })
        # Apply defaults with force
        resp = client.post(f"/api/admin/models/{model_id}/variants/apply-default-pricing", json={"force": True})
        data = resp.json()["data"]
        assert data["skipped"] == 0
        v = next(v for v in data["variants"] if v["size"] == "1024x1024" and v["quality"] == "low")
        # square, standard, low -> 0.05 credits, 1 cost cent, 2 sale cents.
        assert v["upstream_cost_credits"] == 0.05
        assert v["upstream_cost_cents"] == 1
        assert v["member_price_cents"] == 2
        assert v["member_price_credits"] == 0.2

    def test_all_variants_are_active(self, client):
        model_id = setup_admin_and_model(client)
        resp = client.post(f"/api/admin/models/{model_id}/variants/apply-default-pricing", json={"force": False})
        variants = resp.json()["data"]["variants"]
        for v in variants:
            assert v["status"] == "active"
