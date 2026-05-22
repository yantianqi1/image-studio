from __future__ import annotations

from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

from apps.api.app.core.response import api_ok
from apps.api.app.domains.image.payloads import gallery_item_payload, item_payload, job_payload, result_payload


ROOT = Path(__file__).resolve().parents[2]
CONTRACT_DOC = ROOT / "docs/contracts/image-api.md"

JOB_FIELDS = {
    "id",
    "user_id",
    "source",
    "mode",
    "title",
    "prompt",
    "model_code",
    "visibility",
    "source_asset_id",
    "provider_id",
    "provider_model",
    "client_provider_base_url",
    "status",
    "requested_count",
    "attempt_count",
    "max_attempts",
    "size",
    "quality",
    "provider_input_tokens",
    "provider_output_tokens",
    "provider_total_tokens",
    "raw_provider_cost_cents",
    "provider_fee_cents",
    "internal_cost_cents",
    "error_code",
    "error_message",
    "created_at",
    "available_at",
    "started_at",
    "finished_at",
}

RESULT_FIELDS = {
    "id",
    "job_id",
    "result_index",
    "asset_id",
    "asset_url",
    "thumbnail_url",
    "visibility",
    "published_at",
    "created_at",
    "revised_prompt",
    "provider_request_id",
}

GALLERY_ITEM_FIELDS = {
    "asset_id",
    "asset_url",
    "thumbnail_url",
    "visibility",
    "published_at",
    "created_at",
    "job_id",
    "result_index",
    "prompt",
    "revised_prompt",
}

ITEM_FIELDS = {
    "id",
    "job_id",
    "result_index",
    "status",
    "asset_id",
    "error_code",
    "error_message",
    "manual_retry_count",
    "created_at",
    "available_at",
    "started_at",
    "finished_at",
    "cancelled_at",
}


def test_image_job_success_envelope_is_stable() -> None:
    assert set(api_ok({"id": 1})) == {"data", "meta", "error"}


def test_fastapi_image_job_payload_matches_contract_fields() -> None:
    payload = job_payload(build_job())

    assert set(payload) == JOB_FIELDS


def test_fastapi_image_job_result_payload_matches_contract_fields() -> None:
    payload = result_payload(build_result(), asset=build_asset())

    assert set(payload) == RESULT_FIELDS


def test_fastapi_gallery_item_payload_matches_contract_fields() -> None:
    payload = gallery_item_payload(build_result(), job=build_job(), asset=build_asset())

    assert set(payload) == GALLERY_ITEM_FIELDS


def test_fastapi_image_job_item_payload_matches_contract_fields() -> None:
    payload = item_payload(build_item())

    assert set(payload) == ITEM_FIELDS


def test_image_job_item_routes_are_documented() -> None:
    source = CONTRACT_DOC.read_text()

    for text in [
        "GET /api/public/image/jobs/{id}/items",
        "POST /api/public/image/items/{item_id}/retry",
        "POST /api/public/image/items/{item_id}/cancel",
    ]:
        assert text in source


def build_job() -> SimpleNamespace:
    now = datetime(2026, 5, 21, 12, 0, 0)
    return SimpleNamespace(
        id=1,
        user_id=7,
        source="member",
        mode="generate",
        title="Example",
        prompt="Draw a city",
        model_code="gpt-image-2",
        visibility="private",
        source_asset_id=None,
        provider_id=2,
        provider_model="openai/gpt-image-2",
        client_provider_config={"base_url": "https://api.example.test/v1"},
        status="queued",
        requested_count=1,
        attempt_count=0,
        max_attempts=3,
        size="1024x1024",
        quality="high",
        provider_input_tokens=None,
        provider_output_tokens=None,
        provider_total_tokens=None,
        raw_provider_cost_cents=None,
        provider_fee_cents=None,
        internal_cost_cents=None,
        error_code=None,
        error_message=None,
        created_at=now,
        available_at=now,
        started_at=None,
        finished_at=None,
    )


def build_result() -> SimpleNamespace:
    return SimpleNamespace(
        id=10,
        job_id=1,
        result_index=1,
        asset_id=20,
        asset_url="/api/public/image/assets/20",
        revised_prompt=None,
        provider_request_id=None,
    )


def build_asset() -> SimpleNamespace:
    now = datetime(2026, 5, 21, 12, 0, 1)
    return SimpleNamespace(
        id=20,
        visibility="private",
        published_at=None,
        created_at=now,
    )


def build_item() -> SimpleNamespace:
    now = datetime(2026, 5, 21, 12, 0, 2)
    return SimpleNamespace(
        id=30,
        job_id=1,
        result_index=1,
        status="queued",
        asset_id=None,
        error_code=None,
        error_message=None,
        manual_retry_count=0,
        created_at=now,
        available_at=now,
        started_at=None,
        finished_at=None,
        cancelled_at=None,
    )
