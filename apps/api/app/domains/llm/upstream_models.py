from __future__ import annotations

from dataclasses import dataclass
import os

import httpx

from apps.api.app.core.errors import AppError
from apps.api.app.domains.llm.provider_validation import normalize_optional_string

UPSTREAM_MODELS_TIMEOUT_SECONDS = 20.0


@dataclass(frozen=True)
class UpstreamModel:
    id: str
    display_name: str


def fetch_upstream_models(*, url: str, api_key_env: str | None) -> list[UpstreamModel]:
    response = httpx.get(
        normalize_upstream_url(url),
        headers=build_upstream_headers(api_key_env),
        timeout=UPSTREAM_MODELS_TIMEOUT_SECONDS,
    )
    if response.status_code >= 400:
        raise AppError(code="upstream_models_failed", message=extract_upstream_error(response), status_code=502)
    return parse_upstream_models(response.json())


def normalize_upstream_url(url: str) -> str:
    normalized = url.strip()
    if not normalized.startswith(("http://", "https://")):
        raise AppError(code="upstream_url_invalid", message="upstream url invalid", status_code=422)
    return normalized


def build_upstream_headers(api_key_env: str | None) -> dict[str, str]:
    env_name = normalize_optional_string(api_key_env)
    if env_name is None:
        return {}
    value = os.environ.get(env_name)
    if not value:
        raise AppError(
            code="upstream_api_key_missing",
            message=f"upstream api key env {env_name} is not set",
            status_code=500,
        )
    return {"Authorization": f"Bearer {value}"}


def parse_upstream_models(payload: object) -> list[UpstreamModel]:
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise AppError(code="upstream_models_invalid", message="upstream models response invalid", status_code=502)
    return [parse_upstream_model(item) for item in payload["data"]]


def parse_upstream_model(item: object) -> UpstreamModel:
    if not isinstance(item, dict) or not isinstance(item.get("id"), str):
        raise AppError(code="upstream_models_invalid", message="upstream model item invalid", status_code=502)
    model_id = item["id"].strip()
    if not model_id:
        raise AppError(code="upstream_models_invalid", message="upstream model id invalid", status_code=502)
    return UpstreamModel(id=model_id, display_name=model_id)


def resolve_selected_upstream_models(
    *,
    upstream_models: dict[str, UpstreamModel],
    model_ids: list[str],
) -> list[UpstreamModel]:
    selected_models: list[UpstreamModel] = []
    for model_id in model_ids:
        normalized_id = model_id.strip()
        model = upstream_models.get(normalized_id)
        if model is None:
            raise AppError(
                code="upstream_model_not_found",
                message=f"upstream model {normalized_id} not found",
                status_code=404,
            )
        selected_models.append(model)
    return selected_models


def extract_upstream_error(response: httpx.Response | object) -> str:
    try:
        payload = response.json()
    except Exception:
        return getattr(response, "text", "upstream models request failed")
    if isinstance(payload, dict) and isinstance(payload.get("error"), dict):
        message = payload["error"].get("message")
        if isinstance(message, str):
            return message
    return getattr(response, "text", "upstream models request failed")
