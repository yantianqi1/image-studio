from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.service import require_admin
from apps.api.app.domains.llm.admin_ops import delete_provider, delete_sellable_model
from apps.api.app.domains.llm.feature_settings import (
    list_allowed_llm_models,
    list_llm_feature_definitions,
    list_llm_feature_model_settings,
    update_llm_feature_model_settings,
)
from apps.api.app.domains.llm.newapi_catalog import sync_newapi_models
from apps.api.app.domains.llm.route_payloads import (
    llm_feature_payload,
    provider_payload,
    sellable_model_payload,
    upstream_model_payload,
)
from apps.api.app.domains.llm.route_schemas import (
    CreateProviderRequest,
    CreateSellableModelRequest,
    FetchUpstreamModelsRequest,
    ImportUpstreamModelsRequest,
    UpdateLLMFeatureModelsRequest,
    UpdateSellableModelRequest,
)
from apps.api.app.domains.llm.service import (
    create_or_update_sellable_model,
    create_provider,
    fetch_upstream_models,
    import_upstream_models,
    list_admin_models,
    list_providers,
    list_public_models,
)
public_router = APIRouter(tags=["llm-public"])
admin_router = APIRouter(tags=["llm-admin"])
provider_admin_router = APIRouter(prefix="/providers", tags=["llm-admin-providers"])
model_admin_router = APIRouter(prefix="/models", tags=["llm-admin-models"])
facility_admin_router = APIRouter(prefix="/llm/features", tags=["llm-admin-features"])


@public_router.get("/models")
def get_models(session: Session = Depends(get_db_session)):
    models = list_public_models(session)
    payloads = [sellable_model_payload(model) for model in models]
    session.commit()
    return api_ok(payloads)


@provider_admin_router.get("")
def get_provider_list(request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    providers = [provider_payload(provider) for provider in list_providers(session)]
    session.commit()
    return api_ok(providers)


@provider_admin_router.post("", status_code=status.HTTP_201_CREATED)
def create_provider_route(
    payload: CreateProviderRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    provider = create_provider(
        session,
        name=payload.name,
        provider_type=payload.type,
        base_url=payload.base_url,
        api_key_env=payload.api_key_env,
        default_model=payload.default_model,
    )
    session.commit()
    return api_ok(provider_payload(provider))


@provider_admin_router.delete("/{provider_id}")
def delete_provider_route(
    provider_id: int,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    delete_provider(session, provider_id=provider_id)
    session.commit()
    return api_ok({"deleted": True})


@model_admin_router.get("")
def get_admin_models(request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    models = [sellable_model_payload(model) for model in list_admin_models(session)]
    session.commit()
    return api_ok(models)


@model_admin_router.post("", status_code=status.HTTP_201_CREATED)
def create_sellable_model_route(
    payload: CreateSellableModelRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    model, _ = create_or_update_sellable_model(
        session,
        code=payload.code,
        display_name=payload.display_name,
        capability=payload.capability,
        provider_id=payload.provider_id,
        provider_model=payload.provider_model,
        public_enabled=payload.public_enabled,
    )
    session.commit()
    return api_ok(sellable_model_payload(model))


@model_admin_router.post("/upstream")
def fetch_upstream_models_route(
    payload: FetchUpstreamModelsRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    models = fetch_upstream_models(url=payload.url, api_key_env=payload.api_key_env)
    return api_ok([upstream_model_payload(model) for model in models])


@model_admin_router.post("/import-upstream", status_code=status.HTTP_201_CREATED)
def import_upstream_models_route(
    payload: ImportUpstreamModelsRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    models = import_upstream_models(
        session,
        url=payload.url,
        api_key_env=payload.api_key_env,
        provider_id=payload.provider_id,
        model_ids=payload.model_ids,
        capability=payload.capability,
        public_enabled=payload.public_enabled,
    )
    session.commit()
    return api_ok([sellable_model_payload(model) for model in models])


@model_admin_router.post("/sync-newapi")
def sync_newapi_models_route(
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    models = sync_newapi_models(session)
    session.commit()
    return api_ok([sellable_model_payload(model) for model in models])


@facility_admin_router.get("")
def get_llm_feature_settings_route(request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    payload = llm_feature_settings_response(session)
    session.commit()
    return api_ok(payload)


@facility_admin_router.patch("")
def update_llm_feature_settings_route(
    payload: UpdateLLMFeatureModelsRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    updates = {item.feature_key: item.model_code for item in payload.features}
    update_llm_feature_model_settings(session, updates)
    response = llm_feature_settings_response(session)
    session.commit()
    return api_ok(response)


def llm_feature_settings_response(session: Session) -> dict[str, object]:
    definitions = list_llm_feature_definitions()
    settings = {setting.feature_key: setting for setting in list_llm_feature_model_settings(session)}
    model_lookup = {model.code: model for model in list_allowed_llm_models(session)}
    features = [
        llm_feature_payload(
            definition,
            model_code=settings[definition.key].model_code if definition.key in settings else None,
            model=model_lookup.get(settings[definition.key].model_code) if definition.key in settings else None,
        )
        for definition in definitions
    ]
    return {"features": features, "models": [sellable_model_payload(model) for model in model_lookup.values()]}


@model_admin_router.patch("/{model_code:path}")
def update_sellable_model_route(
    model_code: str,
    payload: UpdateSellableModelRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    model, _ = create_or_update_sellable_model(
        session,
        code=model_code,
        display_name=payload.display_name,
        capability=payload.capability,
        provider_id=payload.provider_id,
        provider_model=payload.provider_model,
        public_enabled=payload.public_enabled,
    )
    session.commit()
    return api_ok(sellable_model_payload(model))


@model_admin_router.delete("/{model_code:path}")
def delete_sellable_model_route(
    model_code: str,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    delete_sellable_model(session, model_code=model_code)
    session.commit()
    return api_ok({"deleted": True})


admin_router.include_router(facility_admin_router)
admin_router.include_router(provider_admin_router)
admin_router.include_router(model_admin_router)
