from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.image.gallery import normalize_asset_visibility
from apps.api.app.domains.image.models import ImageJob
from apps.api.app.domains.image.repository import build_reservation, resolve_charge_cents
from apps.api.app.domains.llm.client_provider import ClientProviderConfig, serialize_client_provider_config
from apps.api.app.domains.llm.models import ModelVariant
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
    variant: ModelVariant | None
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
    charge_cents = resolve_created_job_charge_cents(job_input=job_input)
    return build_image_job(
        job_input=job_input,
        charge_cents=charge_cents,
        reservation_id=build_reservation(session, owner=job_input.owner, charge_cents=charge_cents),
    )


def resolve_created_job_charge_cents(*, job_input: CreateImageJobRecordInput) -> int:
    variant = job_input.variant
    return resolve_charge_cents(
        owner=job_input.owner,
        client_provider_config=job_input.client_provider_config,
        requested_count=job_input.requested_count,
        member_price_cents=variant.member_price_cents if variant else job_input.target.model.member_price_cents,
        anonymous_price_cents=variant.anonymous_price_cents if variant else job_input.target.model.anonymous_price_cents,
        has_variant_pricing=variant is not None,
        image_input_count=job_input.image_input_count,
        mode=job_input.mode,
    )


def build_image_job(*, job_input: CreateImageJobRecordInput, charge_cents: int, reservation_id: int | None) -> ImageJob:
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
        charge_cents=charge_cents,
        reservation_id=reservation_id,
        max_attempts=job_input.max_attempts,
        available_at=datetime.utcnow(),
    )


def resolve_provider_model(input: CreateImageJobRecordInput) -> str:
    variant_model = input.variant.upstream_provider_model if input.variant else None
    return variant_model or input.target.provider_model
