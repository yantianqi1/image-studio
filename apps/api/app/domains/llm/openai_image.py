from __future__ import annotations

import base64
import os
from pathlib import Path
from contextlib import ExitStack

import httpx
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.image.models import Asset
from apps.api.app.domains.llm.image_reference import ImageReference, extract_image_reference
from apps.api.app.domains.llm.models import Provider
from apps.api.app.domains.llm.rendering import RenderedImage

OPENAI_GENERATION_ENDPOINT = "/images/generations"
OPENAI_EDIT_ENDPOINT = "/images/edits"
OPENAI_IMAGE_TIMEOUT_SECONDS = 60.0
OPENAI_IMAGE_DOWNLOAD_TIMEOUT_SECONDS = 60.0
OPENAI_IMAGE_OUTPUT_FORMAT = "png"
OPENAI_IMAGE_SIZE = "1024x1024"


def render_openai_compatible_image(
    session: Session,
    *,
    provider: Provider,
    prompt: str,
    provider_model: str,
    source_asset_id: int | None = None,
    reference_asset_ids: tuple[int, ...] = (),
) -> RenderedImage:
    if reference_asset_ids:
        return render_openai_compatible_reference_edit(
            session,
            provider=provider,
            prompt=prompt,
            provider_model=provider_model,
            reference_asset_ids=reference_asset_ids,
        )
    if source_asset_id is not None:
        return render_openai_compatible_edit(
            session,
            provider=provider,
            prompt=prompt,
            provider_model=provider_model,
            source_asset_id=source_asset_id,
        )
    return render_openai_compatible_generation(
        provider=provider,
        prompt=prompt,
        provider_model=provider_model,
    )


def render_openai_compatible_generation(
    *,
    provider: Provider,
    prompt: str,
    provider_model: str,
) -> RenderedImage:
    response = httpx.post(
        build_provider_url(provider.base_url, OPENAI_GENERATION_ENDPOINT),
        headers=build_auth_headers(provider),
        json=build_generation_payload(prompt=prompt, provider_model=provider_model),
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
) -> RenderedImage:
    assets = [resolve_source_asset_file(session, source_asset_id=asset_id) for asset_id in reference_asset_ids]
    with ExitStack() as stack:
        image_files = [
            ("image", (Path(asset.storage_path).name, stack.enter_context(Path(asset.storage_path).open("rb")), asset.mime_type))
            for asset in assets
        ]
        response = httpx.post(
            build_provider_url(provider.base_url, OPENAI_EDIT_ENDPOINT),
            headers={"Authorization": f"Bearer {read_provider_api_key(provider)}"},
            data=build_edit_payload(prompt=prompt, provider_model=provider_model),
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
) -> RenderedImage:
    asset = resolve_source_asset_file(session, source_asset_id=source_asset_id)
    with Path(asset.storage_path).open("rb") as image_file:
        response = httpx.post(
            build_provider_url(provider.base_url, OPENAI_EDIT_ENDPOINT),
            headers={"Authorization": f"Bearer {read_provider_api_key(provider)}"},
            data=build_edit_payload(prompt=prompt, provider_model=provider_model),
            files={"image": (Path(asset.storage_path).name, image_file, asset.mime_type)},
            timeout=OPENAI_IMAGE_TIMEOUT_SECONDS,
        )
    return parse_provider_image_response(response=response, provider=provider, prompt=prompt)


def build_generation_payload(*, prompt: str, provider_model: str) -> dict[str, str]:
    return {
        "model": provider_model,
        "prompt": prompt,
        "size": OPENAI_IMAGE_SIZE,
        "output_format": OPENAI_IMAGE_OUTPUT_FORMAT,
    }


def build_edit_payload(*, prompt: str, provider_model: str) -> dict[str, str]:
    return build_generation_payload(prompt=prompt, provider_model=provider_model)


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


def resolve_source_asset_file(session: Session, *, source_asset_id: int) -> Asset:
    asset = session.get(Asset, source_asset_id)
    if asset is None:
        raise AppError(code="source_asset_not_found", message="source asset not found", status_code=404)
    if not asset.mime_type.startswith("image/"):
        raise AppError(code="source_asset_invalid", message="source asset is not an image", status_code=422)
    if not asset.storage_path or not Path(asset.storage_path).is_file():
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
