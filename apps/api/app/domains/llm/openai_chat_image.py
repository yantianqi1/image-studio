from __future__ import annotations

import base64
import json
import os
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.errors import AppError
from apps.api.app.domains.image.models import Asset
from apps.api.app.domains.llm.image_reference import ImageReference, extract_image_reference
from apps.api.app.domains.llm.models import Provider
from apps.api.app.domains.llm.rendering import RenderedImage

OPENAI_CHAT_COMPLETIONS_ENDPOINT = "/chat/completions"
CHAT_IMAGE_TEMPERATURE = 0.97
CHAT_IMAGE_MAX_TOKENS = 50000
CHAT_IMAGE_SYSTEM_PROMPT = "[Start a new Chat]"


def render_openai_chat_compatible_image(
    session: Session,
    *,
    provider: Provider,
    prompt: str,
    provider_model: str,
    source_asset_id: int | None = None,
    reference_asset_ids: tuple[int, ...] = (),
) -> RenderedImage:
    asset_ids = tuple(reference_asset_ids or ())
    if source_asset_id is not None:
        asset_ids = (*asset_ids, source_asset_id)
    assets = [resolve_image_asset(session, asset_id=asset_id) for asset_id in asset_ids]
    response = httpx.post(
        build_provider_url(provider.base_url),
        headers=build_auth_headers(provider),
        json=build_chat_image_payload(prompt=prompt, provider_model=provider_model, assets=assets),
        timeout=get_settings().chat_image_timeout_seconds,
    )
    return parse_chat_image_response(response=response, provider=provider, prompt=prompt)


def build_chat_image_payload(*, prompt: str, provider_model: str, assets: list[Asset]) -> dict[str, object]:
    return {
        "model": provider_model,
        "messages": build_chat_image_messages(prompt=prompt, assets=assets),
        "temperature": CHAT_IMAGE_TEMPERATURE,
        "max_tokens": CHAT_IMAGE_MAX_TOKENS,
        "stream": True,
        "presence_penalty": 0,
        "frequency_penalty": 0,
    }


def build_chat_image_messages(*, prompt: str, assets: list[Asset]) -> list[dict[str, object]]:
    if not assets:
        return [
            {"role": "system", "content": CHAT_IMAGE_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]
    content: list[dict[str, object]] = [{"type": "text", "text": prompt}]
    content.extend(build_image_content(asset) for asset in assets)
    return [{"role": "system", "content": CHAT_IMAGE_SYSTEM_PROMPT}, {"role": "user", "content": content}]


def build_image_content(asset: Asset) -> dict[str, object]:
    encoded = base64.b64encode(Path(asset.storage_path).read_bytes()).decode("ascii")
    return {"type": "image_url", "image_url": {"url": f"data:{asset.mime_type};base64,{encoded}"}}


def parse_chat_image_response(*, response: httpx.Response | object, provider: Provider, prompt: str) -> RenderedImage:
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
    )


def parse_response_payload(response: httpx.Response | object) -> dict[str, object]:
    content_type = response.headers.get("content-type", "")
    if "text/event-stream" in content_type:
        return {"choices": [{"message": {"content": parse_streaming_content(response.text)}}]}
    return response.json()


def parse_streaming_content(text: str) -> str:
    chunks: list[str] = []
    for line in text.splitlines():
        if not line.startswith("data:"):
            continue
        data = line.removeprefix("data:").strip()
        if not data or data == "[DONE]":
            continue
        append_streaming_chunk(chunks, data)
    return "".join(chunks)


def append_streaming_chunk(chunks: list[str], data: str) -> None:
    payload = json.loads(data)
    choices = payload.get("choices") if isinstance(payload, dict) else None
    if not isinstance(choices, list) or not choices:
        return
    choice = choices[0]
    if not isinstance(choice, dict):
        return
    delta = choice.get("delta")
    message = choice.get("message")
    content = extract_content(delta) or extract_content(message)
    if content:
        chunks.append(content)


def extract_content(value: object) -> str:
    if not isinstance(value, dict):
        return ""
    content = value.get("content")
    return content if isinstance(content, str) else ""


def resolve_image_reference(reference: ImageReference) -> tuple[bytes, str]:
    if reference.kind == "base64":
        return base64.b64decode(reference.value), "image/png"
    if reference.kind == "url":
        return download_provider_image(reference.value)
    raise AppError(code="provider_response_invalid", message="provider image reference invalid", status_code=502)


def resolve_image_asset(session: Session, *, asset_id: int) -> Asset:
    asset = session.get(Asset, asset_id)
    if asset is None:
        raise AppError(code="source_asset_not_found", message="source asset not found", status_code=404)
    if not asset.mime_type.startswith("image/"):
        raise AppError(code="source_asset_invalid", message="source asset is not an image", status_code=422)
    if not asset.storage_path or not Path(asset.storage_path).is_file():
        raise AppError(code="source_asset_file_missing", message="source asset file missing", status_code=500)
    return asset


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
    return f"{base_url.rstrip('/')}{OPENAI_CHAT_COMPLETIONS_ENDPOINT}"


def download_provider_image(url: str) -> tuple[bytes, str]:
    response = httpx.get(url, timeout=get_settings().chat_image_download_timeout_seconds)
    if response.status_code >= 400:
        raise AppError(code="provider_image_download_failed", message="provider image download failed", status_code=502)
    return response.content, response.headers.get("content-type", "image/png")


def extract_provider_error(response: httpx.Response | object) -> str:
    try:
        payload = response.json()
    except Exception:
        return getattr(response, "text", "provider request failed")
    error = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(error, dict) and isinstance(error.get("message"), str):
        return error["message"]
    return getattr(response, "text", "provider request failed")
