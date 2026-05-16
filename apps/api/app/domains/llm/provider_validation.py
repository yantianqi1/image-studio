from __future__ import annotations

from apps.api.app.core.errors import AppError

LOCAL_DEV_PROVIDER_TYPE = "local-dev"
OPENAI_COMPATIBLE_PROVIDER_TYPE = "openai-compatible"
OPENAI_CHAT_COMPATIBLE_PROVIDER_TYPE = "openai-chat-compatible"
OPENROUTER_CHAT_IMAGE_PROVIDER_TYPE = "openrouter-chat-image"
REMOTE_PROVIDER_TYPES = {
    OPENAI_COMPATIBLE_PROVIDER_TYPE,
    OPENAI_CHAT_COMPATIBLE_PROVIDER_TYPE,
    OPENROUTER_CHAT_IMAGE_PROVIDER_TYPE,
}
SUPPORTED_PROVIDER_TYPES = {LOCAL_DEV_PROVIDER_TYPE, *REMOTE_PROVIDER_TYPES}


def validate_provider_type(provider_type: str) -> None:
    if provider_type not in SUPPORTED_PROVIDER_TYPES:
        raise AppError(code="provider_type_invalid", message="provider type invalid", status_code=422)


def validate_provider_config(*, provider_type: str, base_url: str | None, api_key_env: str | None) -> None:
    if provider_type not in REMOTE_PROVIDER_TYPES:
        return
    if not normalize_optional_string(base_url) or not normalize_optional_string(api_key_env):
        raise AppError(code="provider_config_invalid", message="provider config invalid", status_code=422)


def validate_capability(capability: str) -> None:
    if capability not in {"image", "text", "chat"}:
        raise AppError(code="model_capability_invalid", message="model capability invalid", status_code=422)


def normalize_optional_string(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None
