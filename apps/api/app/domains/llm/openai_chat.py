from __future__ import annotations

import json
import os
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.errors import AppError
from apps.api.app.domains.llm.catalog import ensure_provider_catalog
from apps.api.app.domains.llm.client_provider import ClientProviderConfig, build_runtime_provider
from apps.api.app.domains.llm.models import Provider, SellableModel
from apps.api.app.domains.llm.provider_validation import OPENAI_CHAT_COMPATIBLE_PROVIDER_TYPE, OPENAI_COMPATIBLE_PROVIDER_TYPE

OPENAI_CHAT_ENDPOINT = "/chat/completions"
OPENAI_CHAT_TIMEOUT_SECONDS = 60.0
JSON_OPENERS = ("{", "[")


def generate_structured_chat(
    session: Session,
    *,
    system_prompt: str,
    user_payload: dict,
    schema_name: str,
    response_schema: dict | None = None,
    client_provider_config: ClientProviderConfig | None = None,
) -> dict:
    target = resolve_client_chat_target(client_provider_config) if client_provider_config else resolve_chat_target(session)
    response = httpx.post(
        build_provider_url(target.provider.base_url),
        headers=build_auth_headers(target.provider),
        json=build_chat_payload(target.provider_model, system_prompt, user_payload, schema_name, response_schema=response_schema),
        timeout=OPENAI_CHAT_TIMEOUT_SECONDS,
    )
    return parse_chat_response(response, response_schema=response_schema)


class ChatTarget:
    def __init__(self, *, provider: Provider, provider_model: str) -> None:
        self.provider = provider
        self.provider_model = provider_model


def resolve_chat_target(session: Session) -> ChatTarget:
    ensure_provider_catalog(session)
    settings = get_settings()
    statement = select(SellableModel, Provider).join(Provider, SellableModel.provider_id == Provider.id).where(
        SellableModel.code == settings.openai_chat_model_code,
        SellableModel.capability.in_(("chat", "text")),
        Provider.status == "active",
    )
    row = session.execute(statement).first()
    if row is None:
        raise AppError(code="comic_llm_not_configured", message="comic LLM chat model is not configured", status_code=500)
    model, provider = row
    if provider.type not in {OPENAI_COMPATIBLE_PROVIDER_TYPE, OPENAI_CHAT_COMPATIBLE_PROVIDER_TYPE}:
        raise AppError(code="comic_llm_not_configured", message="comic LLM provider is not chat compatible", status_code=500)
    return ChatTarget(provider=provider, provider_model=model.provider_model or provider.default_model)


def resolve_client_chat_target(config: ClientProviderConfig) -> ChatTarget:
    settings = get_settings()
    provider = build_runtime_provider(config)
    provider_model = settings.openai_chat_model_provider_model or settings.openai_chat_model_code
    return ChatTarget(provider=provider, provider_model=provider_model)


def build_chat_payload(
    provider_model: str,
    system_prompt: str,
    user_payload: dict,
    schema_name: str,
    *,
    response_schema: dict | None = None,
) -> dict:
    content = {"input": user_payload}
    if response_schema is not None:
        content["required_response_json_schema"] = response_schema
    return {
        "model": provider_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(content, ensure_ascii=False)},
        ],
        "response_format": {"type": "json_object"},
        "metadata": {"schema_name": schema_name},
    }


def parse_chat_response(response: httpx.Response | object, *, response_schema: dict | None = None) -> dict:
    if response.status_code >= 400:
        raise AppError(code="provider_request_failed", message=extract_provider_error(response), status_code=502)
    payload = response.json()
    content = payload.get("choices", [{}])[0].get("message", {}).get("content") if isinstance(payload, dict) else None
    if not isinstance(content, str):
        raise AppError(code="provider_response_invalid", message="provider chat response missing content", status_code=502)
    return parse_chat_content(content, response_schema=response_schema)


def parse_chat_content(content: str, *, response_schema: dict | None = None) -> dict:
    outer_string = parse_outer_json_string(content.strip())
    if outer_string is not None:
        return normalize_chat_json(outer_string, response_schema=response_schema)
    last_error: json.JSONDecodeError | None = None
    for start in find_json_starts(content):
        try:
            parsed, end = json.JSONDecoder().raw_decode(content, idx=start)
        except json.JSONDecodeError as exc:
            last_error = exc
            continue
        reject_multiple_json_values(content[end:])
        return normalize_chat_json(parsed, response_schema=response_schema)
    if last_error is not None:
        raise AppError(code="provider_response_invalid", message=f"provider chat response invalid JSON: {last_error}", status_code=502) from last_error
    raise AppError(code="provider_response_invalid", message="provider chat response missing JSON object", status_code=502)


def parse_outer_json_string(content: str) -> str | None:
    if not content.startswith('"'):
        return None
    try:
        parsed, end = json.JSONDecoder().raw_decode(content)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, str) and not content[end:].strip():
        return parsed
    return None


def find_json_starts(content: str) -> list[int]:
    return [index for index, char in enumerate(content) if char in JSON_OPENERS]


def reject_multiple_json_values(trailing_content: str) -> None:
    stripped = trailing_content.strip()
    if stripped.startswith(JSON_OPENERS):
        raise AppError(code="provider_response_invalid", message="provider chat response contains multiple JSON values", status_code=502)


def normalize_chat_json(parsed: Any, *, response_schema: dict | None = None) -> dict:
    if isinstance(parsed, dict):
        return parsed
    if isinstance(parsed, str):
        return parse_chat_content(parsed, response_schema=response_schema)
    if isinstance(parsed, list):
        wrapped = wrap_schema_array(parsed, response_schema=response_schema)
        if wrapped is not None:
            return wrapped
        if is_single_object_array(parsed):
            return parsed[0]
    raise AppError(code="provider_response_invalid", message="provider chat response must be a JSON object", status_code=502)


def wrap_schema_array(parsed: list, *, response_schema: dict | None) -> dict | None:
    field = find_single_array_property(response_schema)
    if field is None:
        return None
    if is_single_object_array(parsed) and object_overlaps_schema(parsed[0], response_schema):
        return None
    return {field: parsed}


def find_single_array_property(response_schema: dict | None) -> str | None:
    properties = response_schema.get("properties") if isinstance(response_schema, dict) else None
    if not isinstance(properties, dict):
        return None
    fields = [name for name, schema in properties.items() if isinstance(schema, dict) and schema.get("type") == "array"]
    return fields[0] if len(fields) == 1 else None


def object_overlaps_schema(value: dict, response_schema: dict | None) -> bool:
    properties = response_schema.get("properties") if isinstance(response_schema, dict) else None
    if not isinstance(properties, dict):
        return False
    return bool(set(value.keys()) & set(properties.keys()))


def is_single_object_array(parsed: Any) -> bool:
    return isinstance(parsed, list) and len(parsed) == 1 and isinstance(parsed[0], dict)


def build_auth_headers(provider: Provider) -> dict[str, str]:
    return {"Authorization": f"Bearer {read_provider_api_key(provider)}", "Content-Type": "application/json"}


def read_provider_api_key(provider: Provider) -> str:
    explicit_key = getattr(provider, "api_key", None)
    if isinstance(explicit_key, str) and explicit_key:
        return explicit_key
    if not provider.api_key_env:
        raise AppError(code="provider_api_key_missing", message="provider api key env missing", status_code=422)
    value = os.environ.get(provider.api_key_env)
    if not value:
        raise AppError(code="provider_api_key_missing", message=f"provider api key env {provider.api_key_env} is not set", status_code=500)
    return value


def build_provider_url(base_url: str | None) -> str:
    if not base_url:
        raise AppError(code="provider_base_url_missing", message="provider base url missing", status_code=422)
    return f"{base_url.rstrip('/')}{OPENAI_CHAT_ENDPOINT}"


def extract_provider_error(response: httpx.Response | object) -> str:
    try:
        payload = response.json()
    except Exception:
        return getattr(response, "text", "provider request failed")
    error = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(error, dict) and isinstance(error.get("message"), str):
        return error["message"]
    return getattr(response, "text", "provider request failed")
