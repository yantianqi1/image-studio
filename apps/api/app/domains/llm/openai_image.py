from __future__ import annotations

import base64
import os
from contextlib import ExitStack
from io import BytesIO
from pathlib import PurePosixPath

import httpx
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.image.models import Asset
from apps.api.app.domains.llm.image_reference import ImageReference, extract_image_reference
from apps.api.app.domains.llm.models import Provider
from apps.api.app.domains.llm.rendering import RenderedImage
from apps.api.app.infra.storage.asset_storage import AssetStorage
from apps.api.app.infra.storage.factory import build_asset_storage

OPENAI_GENERATION_ENDPOINT = "/images/generations"
OPENAI_EDIT_ENDPOINT = "/images/edits"
OPENAI_IMAGE_TIMEOUT_SECONDS = 60.0
OPENAI_IMAGE_DOWNLOAD_TIMEOUT_SECONDS = 60.0


def render_openai_compatible_image(
    session: Session,
    *,
    provider: Provider,
    prompt: str,
    provider_model: str,
    source_asset_id: int | None = None,
    reference_asset_ids: tuple[int, ...] = (),
    size: str | None = None,
    quality: str | None = None,
) -> RenderedImage:
    if reference_asset_ids:
        return render_openai_compatible_reference_edit(
            session,
            provider=provider,
            prompt=prompt,
            provider_model=provider_model,
            reference_asset_ids=reference_asset_ids,
            size=size,
            quality=quality,
        )
    if source_asset_id is not None:
        return render_openai_compatible_edit(
            session,
            provider=provider,
            prompt=prompt,
            provider_model=provider_model,
            source_asset_id=source_asset_id,
            size=size,
            quality=quality,
        )
    return render_openai_compatible_generation(
        provider=provider,
        prompt=prompt,
        provider_model=provider_model,
        size=size,
        quality=quality,
    )


def render_openai_compatible_generation(
    *,
    provider: Provider,
    prompt: str,
    provider_model: str,
    size: str | None = None,
    quality: str | None = None,
) -> RenderedImage:
    response = httpx.post(
        build_provider_url(provider.base_url, OPENAI_GENERATION_ENDPOINT),
        headers=build_auth_headers(provider),
        json=build_generation_payload(prompt=prompt, provider_model=provider_model, size=size, quality=quality),
        timeout=OPENAI_IMAGE_TIMEOUT_SECONDS,
    )
    return parse_provider_image_response(response=response, provider=provider, prompt=prompt)


def render_openai_compatible_reference_edit(
    session: Session,
    *,
    provider: Provider,
    prompt: str,
    provider_model: str,
    reference_asset_ids: tuple[int, ...],
    size: str | None = None,
    quality: str | None = None,
) -> RenderedImage:
    storage = build_asset_storage()
    assets = [resolve_source_asset(session, source_asset_id=asset_id, storage=storage) for asset_id in reference_asset_ids]
    with ExitStack() as stack:
        image_files = [build_multipart_image_file(asset, storage=storage, stack=stack) for asset in assets]
        response = httpx.post(
            build_provider_url(provider.base_url, OPENAI_EDIT_ENDPOINT),
            headers={"Authorization": f"Bearer {read_provider_api_key(provider)}"},
            data=build_edit_payload(prompt=prompt, provider_model=provider_model, size=size, quality=quality),
            files=image_files,
            timeout=OPENAI_IMAGE_TIMEOUT_SECONDS,
        )
    return parse_provider_image_response(response=response, provider=provider, prompt=prompt)


def render_openai_compatible_edit(
    session: Session,
    *,
    provider: Provider,
    prompt: str,
    provider_model: str,
    source_asset_id: int,
    size: str | None = None,
    quality: str | None = None,
) -> RenderedImage:
    storage = build_asset_storage()
    asset = resolve_source_asset(session, source_asset_id=source_asset_id, storage=storage)
    with ExitStack() as stack:
        image_file = build_multipart_image_file(asset, storage=storage, stack=stack)[1]
        response = httpx.post(
            build_provider_url(provider.base_url, OPENAI_EDIT_ENDPOINT),
            headers={"Authorization": f"Bearer {read_provider_api_key(provider)}"},
            data=build_edit_payload(prompt=prompt, provider_model=provider_model, size=size, quality=quality),
            files={"image": image_file},
            timeout=OPENAI_IMAGE_TIMEOUT_SECONDS,
        )
    return parse_provider_image_response(response=response, provider=provider, prompt=prompt)


def build_generation_payload(*, prompt: str, provider_model: str, size: str | None = None, quality: str | None = None) -> dict[str, str]:
    payload: dict[str, str] = {
        "model": provider_model,
        "prompt": prompt,
    }
    if size:
        payload["size"] = size
    if quality:
        payload["quality"] = quality
    return payload


def build_edit_payload(*, prompt: str, provider_model: str, size: str | None = None, quality: str | None = None) -> dict[str, str]:
    return build_generation_payload(prompt=prompt, provider_model=provider_model, size=size, quality=quality)


def parse_provider_image_response(*, response: httpx.Response | object, provider: Provider, prompt: str) -> RenderedImage:
    if response.status_code >= 400:
        raise AppError(code="provider_request_failed", message=extract_provider_error(response), status_code=502)
    image_reference = extract_image_reference(response.json())
    content, mime_type = resolve_image_reference(image_reference)
    return RenderedImage(
        content=content,
        mime_type=mime_type,
        revised_prompt=prompt,
        provider_request_id=response.headers.get("x-request-id", f"{provider.name}:{abs(hash(prompt))}"),
    )


def build_multipart_image_file(asset: Asset, *, storage: AssetStorage, stack: ExitStack):
    content = storage.read_bytes(asset.storage_path)
    image_file = stack.enter_context(BytesIO(content))
    return "image", (PurePosixPath(asset.storage_path).name, image_file, asset.mime_type)


def resolve_source_asset(session: Session, *, source_asset_id: int, storage: AssetStorage) -> Asset:
    asset = session.get(Asset, source_asset_id)
    if asset is None:
        raise AppError(code="source_asset_not_found", message="source asset not found", status_code=404)
    if not asset.mime_type.startswith("image/"):
        raise AppError(code="source_asset_invalid", message="source asset is not an image", status_code=422)
    if not asset.storage_path or not storage.exists(asset.storage_path):
        raise AppError(code="source_asset_file_missing", message="source asset file missing", status_code=500)
    return asset


def resolve_image_reference(reference: ImageReference) -> tuple[bytes, str]:
    if reference.kind == "base64":
        return base64.b64decode(reference.value), "image/png"
    if reference.kind == "url":
        return download_provider_image(reference.value)
    raise AppError(code="provider_response_invalid", message="provider image reference invalid", status_code=502)


def build_auth_headers(provider: Provider) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {read_provider_api_key(provider)}",
        "Content-Type": "application/json",
    }


def read_provider_api_key(provider: Provider) -> str:
    explicit_key = getattr(provider, "api_key", None)
    if isinstance(explicit_key, str) and explicit_key:
        return explicit_key
    if not provider.api_key_env:
        raise AppError(code="provider_api_key_missing", message="provider api key env missing", status_code=422)
    value = os.environ.get(provider.api_key_env)
    if value:
        return value
    raise AppError(
        code="provider_api_key_missing",
        message=f"provider api key env {provider.api_key_env} is not set",
        status_code=500,
    )


def build_provider_url(base_url: str | None, endpoint: str) -> str:
    if not base_url:
        raise AppError(code="provider_base_url_missing", message="provider base url missing", status_code=422)
    return f"{base_url.rstrip('/')}{endpoint}"


def download_provider_image(url: str) -> tuple[bytes, str]:
    response = httpx.get(url, timeout=OPENAI_IMAGE_DOWNLOAD_TIMEOUT_SECONDS)
    if response.status_code >= 400:
        raise AppError(code="provider_image_download_failed", message=extract_provider_error(response), status_code=502)
    mime_type = response.headers.get("content-type", "image/png").split(";", 1)[0]
    if mime_type.startswith("image/"):
        return response.content, mime_type
    raise AppError(code="provider_image_download_invalid", message="provider image url did not return an image", status_code=502)


def extract_provider_error(response: httpx.Response | object) -> str:
    try:
        payload = response.json()
    except Exception:
        return getattr(response, "text", "provider request failed")
    if not isinstance(payload, dict):
        return getattr(response, "text", "provider request failed")
    error = payload.get("error")
    if isinstance(error, dict) and isinstance(error.get("message"), str):
        return error["message"]
    return getattr(response, "text", "provider request failed")
