from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from fastapi import Request

from apps.api.app.core.errors import AppError
from apps.api.app.domains.llm.provider_validation import normalize_optional_string, validate_provider_type

CLIENT_PROVIDER_SOURCE = "client_provider"
CLIENT_PROVIDER_CONFIG_KEY = "_client_provider"
CLIENT_ID_HEADER = "x-client-id"
PROVIDER_BASE_URL_HEADER = "x-client-provider-base-url"
PROVIDER_API_KEY_HEADER = "x-client-provider-api-key"
LOGIN_OR_CLIENT_PROVIDER_REQUIRED_CODE = "login_or_client_provider_required"
LOGIN_OR_CLIENT_PROVIDER_REQUIRED_MESSAGE = "请先登录，或配置浏览器端供应商密钥后重试"
CLIENT_PROVIDER_CONFIG_INVALID_CODE = "client_provider_config_invalid"
MAX_CLIENT_ID_LENGTH = 128


@dataclass(frozen=True)
class ClientProviderConfig:
    client_id: str
    base_url: str
    api_key: str
    provider_type: str | None = None


@dataclass(frozen=True)
class RuntimeProvider:
    name: str
    type: str
    base_url: str
    api_key: str
    api_key_env: str | None = None
    default_model: str | None = None
    status: str = "active"


def read_client_provider_config(request: Request) -> ClientProviderConfig | None:
    client_id = normalize_optional_string(request.headers.get(CLIENT_ID_HEADER))
    base_url = normalize_optional_string(request.headers.get(PROVIDER_BASE_URL_HEADER))
    api_key = normalize_optional_string(request.headers.get(PROVIDER_API_KEY_HEADER))
    if client_id is None and base_url is None and api_key is None:
        return None
    if client_id is None or base_url is None or api_key is None:
        raise_client_provider_config_invalid("client id, provider base url and api key are required together")
    validate_client_id(client_id)
    validate_base_url(base_url)
    return ClientProviderConfig(client_id=client_id, base_url=base_url, api_key=api_key)


def require_login_or_client_provider(config: ClientProviderConfig | None) -> None:
    if config is not None:
        return
    raise AppError(
        code=LOGIN_OR_CLIENT_PROVIDER_REQUIRED_CODE,
        message=LOGIN_OR_CLIENT_PROVIDER_REQUIRED_MESSAGE,
        status_code=401,
    )


def serialize_client_provider_config(
    *,
    config: ClientProviderConfig | None,
    provider_type: str,
) -> dict[str, str] | None:
    if config is None:
        return None
    validate_provider_type(provider_type)
    return {
        "client_id": config.client_id,
        "base_url": config.base_url,
        "api_key": config.api_key,
        "provider_type": provider_type,
    }


def client_provider_config_from_mapping(payload: Mapping[str, object]) -> ClientProviderConfig:
    client_id = require_payload_string(payload, "client_id")
    base_url = require_payload_string(payload, "base_url")
    api_key = require_payload_string(payload, "api_key")
    provider_type = require_payload_string(payload, "provider_type")
    validate_client_id(client_id)
    validate_base_url(base_url)
    validate_provider_type(provider_type)
    return ClientProviderConfig(
        client_id=client_id,
        base_url=base_url,
        api_key=api_key,
        provider_type=provider_type,
    )


def build_runtime_provider(config: ClientProviderConfig) -> RuntimeProvider:
    if config.provider_type is None:
        raise_client_provider_config_invalid("client provider type is missing")
    validate_provider_type(config.provider_type)
    return RuntimeProvider(
        name=CLIENT_PROVIDER_SOURCE,
        type=config.provider_type,
        base_url=config.base_url,
        api_key=config.api_key,
    )


def require_payload_string(payload: Mapping[str, object], key: str) -> str:
    value = normalize_optional_string(payload.get(key))
    if value is None:
        raise_client_provider_config_invalid(f"client provider {key} is missing")
    return value


def validate_client_id(client_id: str) -> None:
    if len(client_id) > MAX_CLIENT_ID_LENGTH:
        raise_client_provider_config_invalid("client id is too long")


def validate_base_url(base_url: str) -> None:
    if not base_url.startswith(("http://", "https://")):
        raise_client_provider_config_invalid("client provider base url must be http or https")


def raise_client_provider_config_invalid(message: str) -> None:
    raise AppError(
        code=CLIENT_PROVIDER_CONFIG_INVALID_CODE,
        message=message,
        status_code=422,
    )
