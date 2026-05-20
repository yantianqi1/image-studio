from apps.api.app.domains.llm.feature_settings import LLMFeatureDefinition
from apps.api.app.domains.llm.models import Provider, SellableModel


def provider_payload(provider: Provider) -> dict[str, object]:
    return {
        "id": provider.id,
        "name": provider.name,
        "type": provider.type,
        "base_url": provider.base_url,
        "api_key_env": provider.api_key_env,
        "default_model": provider.default_model,
        "status": provider.status,
    }


def sellable_model_payload(model: SellableModel) -> dict[str, object]:
    payload = {
        "id": model.id,
        "code": model.code,
        "display_name": model.display_name,
        "capability": model.capability,
        "provider_id": model.provider_id,
        "provider_model": model.provider_model,
        "public_enabled": model.public_enabled,
    }
    return payload


def upstream_model_payload(model: object) -> dict[str, object]:
    return {
        "id": getattr(model, "id"),
        "display_name": getattr(model, "display_name"),
    }


def llm_feature_payload(
    definition: LLMFeatureDefinition,
    *,
    model_code: str | None,
    model: SellableModel | None,
) -> dict[str, object]:
    return {
        "feature_key": definition.key,
        "display_name": definition.display_name,
        "description": definition.description,
        "input_mode": definition.input_mode,
        "required_capabilities": list(definition.required_capabilities),
        "default_model_code": definition.default_model_code,
        "model_code": model_code,
        "model": sellable_model_payload(model) if model is not None else None,
    }
