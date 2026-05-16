from __future__ import annotations

import base64
import math
import os
import re
from decimal import Decimal, InvalidOperation, ROUND_CEILING

import httpx
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.image.models import Asset
from apps.api.app.domains.llm.image_reference import ImageReference, extract_image_reference
from apps.api.app.domains.llm.models import Provider
from apps.api.app.domains.llm.openai_chat_image_messages import (
    build_chat_image_messages,
    collect_render_asset_ids,
)
from apps.api.app.domains.llm.openrouter_image_options import OPENROUTER_SIZE_TO_ASPECT_RATIO
from apps.api.app.domains.llm.rendering import ProviderUsage, RenderedImage
from apps.api.app.infra.storage.asset_storage import AssetStorage
from apps.api.app.infra.storage.factory import build_asset_storage

OPENROUTER_CHAT_COMPLETIONS_ENDPOINT = "/chat/completions"
OPENROUTER_TIMEOUT_SECONDS = 300.0
OPENROUTER_DOWNLOAD_TIMEOUT_SECONDS = 60.0
OPENROUTER_MODALITIES = ["image", "text"]
QUALITY_IMAGE_SIZES = {"low": "1K", "medium": "2K", "high": "4K"}
ASPECT_RATIO_PATTERN = re.compile(r"^\d+:\d+$")
CENTS_PER_UNIT = Decimal("100")


def render_openrouter_chat_image(
    session: Session,
    *,
    provider: Provider,
    prompt: str,
    provider_model: str,
    source_asset_id: int | None = None,
    reference_asset_ids: tuple[int, ...] = (),
    conversation_messages: list[dict] | None = None,
    size: str | None = None,
    quality: str | None = None,
) -> RenderedImage:
    asset_ids = collect_render_asset_ids(
        source_asset_id=source_asset_id,
        reference_asset_ids=reference_asset_ids,
        conversation_messages=conversation_messages,
    )
    storage = build_asset_storage()
    assets = [resolve_image_asset(session, asset_id=asset_id, storage=storage) for asset_id in asset_ids]
    response = httpx.post(
        build_provider_url(provider.base_url),
        headers=build_auth_headers(provider),
        json=build_openrouter_payload(
            prompt=prompt,
            provider_model=provider_model,
            assets=assets,
            storage=storage,
            conversation_messages=conversation_messages,
            size=size,
            quality=quality,
        ),
        timeout=OPENROUTER_TIMEOUT_SECONDS,
    )
    return parse_openrouter_response(response=response, provider=provider, prompt=prompt)


def build_openrouter_payload(
    *,
    prompt: str,
    provider_model: str,
    assets: list[Asset],
    storage: AssetStorage,
    conversation_messages: list[dict] | None,
    size: str | None,
    quality: str | None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "model": provider_model,
        "messages": build_chat_image_messages(
            prompt=prompt.strip(),
            assets=assets,
            storage=storage,
            conversation_messages=conversation_messages,
        ),
        "modalities": OPENROUTER_MODALITIES,
    }
    image_config = build_image_config(size=size, quality=quality)
    if image_config:
        payload["image_config"] = image_config
    return payload


def build_image_config(*, size: str | None, quality: str | None) -> dict[str, str]:
    config: dict[str, str] = {}
    aspect_ratio = resolve_aspect_ratio(size)
    image_size = resolve_image_size(quality)
    if aspect_ratio:
        config["aspect_ratio"] = aspect_ratio
    if image_size:
        config["image_size"] = image_size
    return config


def resolve_aspect_ratio(size: str | None) -> str | None:
    normalized = (size or "").strip().lower()
    if not normalized or normalized == "auto":
        return None
    if ASPECT_RATIO_PATTERN.match(normalized):
        return normalized
    mapped_ratio = OPENROUTER_SIZE_TO_ASPECT_RATIO.get(normalized)
    if mapped_ratio:
        return mapped_ratio
    dimensions = parse_pixel_size(normalized)
    if dimensions is None:
        raise AppError(code="openrouter_image_size_invalid", message="openrouter image size invalid", status_code=422)
    width, height = dimensions
    divisor = math.gcd(width, height)
    return f"{width // divisor}:{height // divisor}"


def parse_pixel_size(size: str) -> tuple[int, int] | None:
    parts = size.split("x", 1)
    if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
        return None
    width = int(parts[0])
    height = int(parts[1])
    if width <= 0 or height <= 0:
        return None
    return width, height


def resolve_image_size(quality: str | None) -> str | None:
    normalized = (quality or "").strip().lower()
    if not normalized:
        return None
    image_size = QUALITY_IMAGE_SIZES.get(normalized)
    if image_size is None:
        raise AppError(code="openrouter_image_quality_invalid", message="openrouter image quality invalid", status_code=422)
    return image_size


def parse_openrouter_response(*, response: httpx.Response | object, provider: Provider, prompt: str) -> RenderedImage:
    if response.status_code >= 400:
        raise AppError(code="provider_request_failed", message=extract_provider_error(response), status_code=502)
    payload = parse_response_payload(response)
    image_reference = extract_image_reference(payload)
    content, mime_type = resolve_image_reference(image_reference)
    return RenderedImage(
        content=content,
        mime_type=mime_type,
        revised_prompt=prompt,
        provider_request_id=response.headers.get("x-request-id", f"{provider.name}:{abs(hash(prompt))}"),
        usage=parse_openrouter_usage(payload),
    )


def parse_response_payload(response: httpx.Response | object) -> dict[str, object]:
    try:
        payload = response.json()
    except ValueError as exc:
        raise AppError(code="provider_response_invalid", message="provider response json invalid", status_code=502) from exc
    if not isinstance(payload, dict):
        raise AppError(code="provider_response_invalid", message="provider response invalid", status_code=502)
    return payload


def parse_openrouter_usage(payload: dict[str, object]) -> ProviderUsage:
    usage = payload.get("usage")
    if not isinstance(usage, dict):
        raise AppError(code="provider_usage_missing", message="openrouter usage missing", status_code=502)
    cost_cents = require_cost_cents(usage, "cost")
    upstream_cents = parse_upstream_cost_cents(usage)
    provider_fee_cents = resolve_provider_fee_cents(cost_cents=cost_cents, upstream_cents=upstream_cents)
    return ProviderUsage(
        input_tokens=require_usage_int(usage, "prompt_tokens"),
        output_tokens=require_usage_int(usage, "completion_tokens"),
        total_tokens=require_usage_int(usage, "total_tokens"),
        raw_provider_cost_cents=upstream_cents,
        provider_fee_cents=provider_fee_cents,
        internal_cost_cents=cost_cents,
        raw_payload=dict(usage),
    )


def parse_upstream_cost_cents(usage: dict[str, object]) -> int | None:
    cost_details = usage.get("cost_details")
    if not isinstance(cost_details, dict):
        return None
    return optional_cost_cents(cost_details.get("upstream_inference_cost"))


def resolve_provider_fee_cents(*, cost_cents: int, upstream_cents: int | None) -> int | None:
    if upstream_cents is None:
        return None
    if upstream_cents > cost_cents:
        raise AppError(code="provider_usage_invalid", message="openrouter usage cost invalid", status_code=502)
    return cost_cents - upstream_cents


def require_usage_int(usage: dict[str, object], key: str) -> int:
    value = usage.get(key)
    if not isinstance(value, int) or value < 0:
        raise AppError(code="provider_usage_invalid", message=f"openrouter usage {key} invalid", status_code=502)
    return value


def require_cost_cents(usage: dict[str, object], key: str) -> int:
    cents = optional_cost_cents(usage.get(key))
    if cents is None:
        raise AppError(code="provider_usage_invalid", message=f"openrouter usage {key} invalid", status_code=502)
    return cents


def optional_cost_cents(value: object) -> int | None:
    if value is None:
        return None
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise AppError(code="provider_usage_invalid", message="openrouter usage cost invalid", status_code=502) from exc
    if amount < 0:
        raise AppError(code="provider_usage_invalid", message="openrouter usage cost invalid", status_code=502)
    return int((amount * CENTS_PER_UNIT).to_integral_value(rounding=ROUND_CEILING))


def resolve_image_reference(reference: ImageReference) -> tuple[bytes, str]:
    if reference.kind == "base64":
        return base64.b64decode(reference.value), "image/png"
    if reference.kind == "url":
        return download_provider_image(reference.value)
    raise AppError(code="provider_response_invalid", message="provider image reference invalid", status_code=502)


def resolve_image_asset(session: Session, *, asset_id: int, storage: AssetStorage) -> Asset:
    asset = session.get(Asset, asset_id)
    if asset is None:
        raise AppError(code="source_asset_not_found", message="source asset not found", status_code=404)
    if not asset.mime_type.startswith("image/"):
        raise AppError(code="source_asset_invalid", message="source asset is not an image", status_code=422)
    if not asset.storage_path or not storage.exists(asset.storage_path):
        raise AppError(code="source_asset_file_missing", message="source asset file missing", status_code=500)
    return asset


def download_provider_image(url: str) -> tuple[bytes, str]:
    response = httpx.get(url, timeout=OPENROUTER_DOWNLOAD_TIMEOUT_SECONDS)
    if response.status_code >= 400:
        raise AppError(code="provider_image_download_failed", message=extract_provider_error(response), status_code=502)
    mime_type = response.headers.get("content-type", "image/png").split(";", 1)[0]
    if mime_type.startswith("image/"):
        return response.content, mime_type
    raise AppError(code="provider_image_download_invalid", message="provider image url did not return an image", status_code=502)


def build_auth_headers(provider: Provider) -> dict[str, str]:
    return {"Authorization": f"Bearer {read_provider_api_key(provider)}", "Content-Type": "application/json"}


def read_provider_api_key(provider: Provider) -> str:
    explicit_key = getattr(provider, "api_key", None)
    if isinstance(explicit_key, str) and explicit_key:
        return explicit_key
    if not provider.api_key_env:
        raise AppError(code="provider_api_key_missing", message="provider api key env missing", status_code=422)
    value = os.environ.get(provider.api_key_env)
    if value:
        return value
    raise AppError(code="provider_api_key_missing", message=f"provider api key env {provider.api_key_env} is not set", status_code=500)


def build_provider_url(base_url: str | None) -> str:
    if not base_url:
        raise AppError(code="provider_base_url_missing", message="provider base url missing", status_code=422)
    return f"{base_url.rstrip('/')}{OPENROUTER_CHAT_COMPLETIONS_ENDPOINT}"


def extract_provider_error(response: httpx.Response | object) -> str:
    try:
        payload = response.json()
    except Exception:
        return getattr(response, "text", "provider request failed")
    if isinstance(payload, dict) and isinstance(payload.get("error"), dict):
        message = payload["error"].get("message")
        if isinstance(message, str):
            return message
    return getattr(response, "text", "provider request failed")
