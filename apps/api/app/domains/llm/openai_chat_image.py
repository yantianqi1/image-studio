from __future__ import annotations

import base64
import json
import os

import httpx
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.errors import AppError
from apps.api.app.domains.image.models import Asset
from apps.api.app.domains.llm.image_reference import ImageReference, extract_image_reference
from apps.api.app.domains.llm.models import Provider
from apps.api.app.domains.llm.openai_chat_image_messages import (
    build_chat_image_messages,
    collect_render_asset_ids,
)
from apps.api.app.domains.llm.rendering import RenderedImage
from apps.api.app.infra.storage.asset_storage import AssetStorage
from apps.api.app.infra.storage.factory import build_asset_storage

OPENAI_CHAT_COMPLETIONS_ENDPOINT = "/chat/completions"
CHAT_IMAGE_TEMPERATURE = 0.97
CHAT_IMAGE_MAX_TOKENS = 50000
QUALITY_HINTS = {
    "low": "画质使用 Low 档，优先更快出图，细节可以适度简化。",
    "medium": "画质使用 Medium 档，在速度、细节和整体完成度之间保持平衡。",
    "high": "画质使用 High 档，提升细节、纹理、光影和整体完成度。",
}
ASPECT_RATIO_HINTS = {
    "1:1": "输出为 1:1 正方形构图，主体居中，适合正方形画幅。",
    "3:2": "输出为 3:2 横版构图，适合摄影、产品展示和横向叙事画幅。",
    "16:9": "输出为 16:9 横屏构图，适合宽画幅展示。",
    "21:9": "输出为 21:9 超宽横版构图，适合电影感全景和宽银幕画幅。",
    "9:16": "输出为 9:16 竖屏构图，适合竖版画幅展示。",
    "4:3": "输出为 4:3 比例，兼顾宽度与高度，适合展示画面细节。",
    "3:4": "输出为 3:4 比例，纵向构图，适合人物肖像或竖向场景。",
}


def render_openai_chat_compatible_image(
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
    timeout = httpx.Timeout(connect=30.0, read=get_settings().chat_image_timeout_seconds, write=30.0, pool=10.0)
    response = httpx.post(
        build_provider_url(provider.base_url),
        headers=build_auth_headers(provider),
        json=build_chat_image_payload(
            prompt=prompt,
            provider_model=provider_model,
            assets=assets,
            storage=storage,
            conversation_messages=conversation_messages,
            size=size,
            quality=quality,
        ),
        timeout=timeout,
    )
    return parse_chat_image_response(response=response, provider=provider, prompt=prompt)


def build_chat_image_payload(
    *,
    prompt: str,
    provider_model: str,
    assets: list[Asset],
    storage: AssetStorage,
    conversation_messages: list[dict] | None = None,
    size: str | None = None,
    quality: str | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "model": provider_model,
        "messages": build_chat_image_messages(
            prompt=build_chat_image_prompt(prompt, size=size, quality=quality),
            assets=assets,
            storage=storage,
            conversation_messages=conversation_messages,
        ),
        "temperature": CHAT_IMAGE_TEMPERATURE,
        "max_tokens": CHAT_IMAGE_MAX_TOKENS,
        "stream": True,
        "presence_penalty": 0,
        "frequency_penalty": 0,
    }
    return payload


def build_chat_image_prompt(prompt: str, *, size: str | None, quality: str | None) -> str:
    base_prompt = prompt.strip()
    hints = [hint for hint in (build_size_hint(size), build_quality_hint(quality)) if hint]
    if not hints:
        return base_prompt
    return f"{base_prompt}\n\n" + "\n".join(hints)


def build_size_hint(size: str | None) -> str:
    normalized = (size or "").strip()
    if not normalized or normalized == "auto":
        return ""
    dimensions = parse_pixel_size(normalized)
    if dimensions is not None:
        width, height = dimensions
        return f"输出图片目标分辨率为 {width} x {height} 像素，并严格按该尺寸对应的宽高比构图。"
    if normalized in ASPECT_RATIO_HINTS:
        return ASPECT_RATIO_HINTS[normalized]
    return f"输出图片，目标尺寸或宽高比为 {normalized}。"


def parse_pixel_size(size: str) -> tuple[int, int] | None:
    parts = size.lower().split("x", 1)
    if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
        return None
    width = int(parts[0])
    height = int(parts[1])
    if width <= 0 or height <= 0:
        return None
    return width, height


def build_quality_hint(quality: str | None) -> str:
    return QUALITY_HINTS.get((quality or "").strip().lower(), "")


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
    try:
        payload = response.json()
    except ValueError:
        return build_text_response_payload(getattr(response, "text", ""))
    if isinstance(payload, dict):
        return payload
    return build_text_response_payload(getattr(response, "text", ""))


def build_text_response_payload(text: str) -> dict[str, object]:
    if not text.strip():
        raise AppError(code="provider_response_invalid", message="provider response empty", status_code=502)
    return {"choices": [{"message": {"content": text}}]}


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
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "text" and isinstance(item.get("text"), str):
                parts.append(item["text"])
            elif item.get("type") == "image_url":
                image_url = item.get("image_url")
                if isinstance(image_url, dict) and isinstance(image_url.get("url"), str):
                    parts.append(f'![image]({image_url["url"]})')
        return "".join(parts)
    return ""


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
    mime_type = response.headers.get("content-type", "image/png").split(";", 1)[0]
    if mime_type.startswith("image/"):
        return response.content, mime_type
    raise AppError(code="provider_image_download_invalid", message="provider image url did not return an image", status_code=502)


def extract_provider_error(response: httpx.Response | object) -> str:
    try:
        payload = response.json()
    except Exception:
        return getattr(response, "text", "provider request failed")
    error = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(error, dict) and isinstance(error.get("message"), str):
        return error["message"]
    return getattr(response, "text", "provider request failed")
