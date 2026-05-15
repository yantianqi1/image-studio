from __future__ import annotations

from dataclasses import replace

from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.image.models import ImageJob
from apps.api.app.domains.llm.client_provider import (
    ClientProviderConfig,
    client_provider_config_from_mapping,
    serialize_client_provider_config,
)
from apps.api.app.domains.llm.client_provider_pool import resolve_client_provider_base_url
from apps.api.app.domains.llm.service import render_image_with_client_provider
from apps.api.app.domains.settings.service import get_client_provider_url_pool


def resolve_job_client_provider_config(job: ImageJob) -> ClientProviderConfig | None:
    if not job.client_provider_config:
        return None
    return client_provider_config_from_mapping(job.client_provider_config)


def resolve_render_client_provider_config(
    *,
    session: Session,
    job: ImageJob,
    client_config: ClientProviderConfig | None,
) -> ClientProviderConfig | None:
    if client_config is None or client_config.base_url:
        return client_config
    resolved_config = replace(
        client_config,
        base_url=resolve_client_provider_base_url(
            api_key=client_config.api_key,
            url_pool=get_client_provider_url_pool(session),
        ),
    )
    persist_resolved_client_provider_config(job=job, config=resolved_config)
    session.flush()
    return resolved_config


def render_with_client_provider(session: Session, *, config: ClientProviderConfig, options: dict[str, object]):
    source_asset_id = options.get("source_asset_id")
    reference_asset_ids = options.get("reference_asset_ids")
    conversation_messages = options.get("conversation_messages")
    return render_image_with_client_provider(
        session,
        config=config,
        prompt=str(options["prompt"]),
        model_code=str(options["model_code"]),
        provider_model=str(options.get("provider_model") or ""),
        source_asset_id=source_asset_id if isinstance(source_asset_id, int) else None,
        reference_asset_ids=reference_asset_ids if isinstance(reference_asset_ids, list) else [],
        conversation_messages=conversation_messages if isinstance(conversation_messages, list) else None,
        size=str(options["size"]) if options.get("size") else None,
        quality=str(options["quality"]) if options.get("quality") else None,
    )


def persist_resolved_client_provider_config(*, job: ImageJob, config: ClientProviderConfig) -> None:
    if config.provider_type is None:
        raise AppError(
            code="client_provider_config_invalid",
            message="client provider type is missing",
            status_code=422,
        )
    job.client_provider_config = serialize_client_provider_config(
        config=config,
        provider_type=config.provider_type,
    )
