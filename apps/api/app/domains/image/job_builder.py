from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.image.gallery import normalize_asset_visibility
from apps.api.app.domains.image.models import ImageJob
from apps.api.app.domains.llm.client_provider import ClientProviderConfig, serialize_client_provider_config
from apps.api.app.domains.llm.service import ModelExecutionTarget


@dataclass(frozen=True)
class CreateImageJobRecordInput:
    owner: OwnerContext
    source: str
    title: str | None
    prompt: str
    model_code: str
    requested_count: int
    mode: str
    source_asset_id: int | None
    target: ModelExecutionTarget
    client_access_id: str | None
    client_provider_config: ClientProviderConfig | None
    conversation_messages: list[dict] | None
    storage_subdir: str | None
    visibility: str
    size: str | None
    quality: str | None
    image_input_count: int
    max_attempts: int


def create_image_job_record(session: Session, *, job_input: CreateImageJobRecordInput) -> ImageJob:
    return build_image_job(job_input=job_input)


def build_image_job(*, job_input: CreateImageJobRecordInput) -> ImageJob:
    return ImageJob(
        user_id=job_input.owner.user_id,
        anonymous_session_id=job_input.owner.anonymous_session_id,
        source=job_input.source,
        title=job_input.title,
        prompt=job_input.prompt,
        model_code=job_input.model_code,
        source_asset_id=job_input.source_asset_id,
        provider_id=job_input.target.provider.id,
        provider_model=resolve_provider_model(job_input),
        client_access_id=job_input.client_access_id,
        client_provider_config=serialize_client_provider_config(
            config=job_input.client_provider_config,
            provider_type=job_input.target.provider.type,
        ),
        conversation_messages=job_input.conversation_messages,
        storage_subdir=job_input.storage_subdir,
        visibility=normalize_asset_visibility(job_input.visibility),
        requested_count=job_input.requested_count,
        mode=job_input.mode,
        size=job_input.size,
        quality=job_input.quality,
        max_attempts=job_input.max_attempts,
        available_at=datetime.utcnow(),
    )


def resolve_provider_model(input: CreateImageJobRecordInput) -> str:
    return input.target.provider_model
