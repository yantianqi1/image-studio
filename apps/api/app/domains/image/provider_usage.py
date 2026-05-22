from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.image.models import ImageJob, ImageProviderUsageEvent
from apps.api.app.domains.llm.models import Provider
from apps.api.app.domains.llm.rendering import ProviderUsage


def record_rendered_usage(
    session: Session,
    *,
    job: ImageJob,
    item_id: int | None,
    usage: ProviderUsage | None,
) -> None:
    if usage is None:
        return
    session.add(build_usage_event(session, job=job, item_id=item_id, usage=usage))
    apply_rendered_usage(job, usage)


def build_usage_event(
    session: Session,
    *,
    job: ImageJob,
    item_id: int | None,
    usage: ProviderUsage,
) -> ImageProviderUsageEvent:
    return ImageProviderUsageEvent(
        job_id=job.id,
        item_id=item_id,
        provider_id=job.provider_id,
        provider_name=load_provider_name(session, provider_id=job.provider_id),
        provider_model=job.provider_model,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        total_tokens=usage.total_tokens,
        raw_provider_cost_cents=usage.raw_provider_cost_cents,
        provider_fee_cents=usage.provider_fee_cents,
        internal_cost_cents=usage.internal_cost_cents,
        raw_payload=usage.raw_payload,
    )


def load_provider_name(session: Session, *, provider_id: int | None) -> str | None:
    if provider_id is None:
        return None
    return session.execute(select(Provider.name).where(Provider.id == provider_id)).scalar_one_or_none()


def apply_rendered_usage(job: ImageJob, usage: ProviderUsage) -> None:
    job.provider_input_tokens = add_nullable_int(job.provider_input_tokens, usage.input_tokens)
    job.provider_output_tokens = add_nullable_int(job.provider_output_tokens, usage.output_tokens)
    job.provider_total_tokens = add_nullable_int(job.provider_total_tokens, usage.total_tokens)
    job.raw_provider_cost_cents = add_nullable_int(job.raw_provider_cost_cents, usage.raw_provider_cost_cents)
    job.provider_fee_cents = add_nullable_int(job.provider_fee_cents, usage.provider_fee_cents)
    job.internal_cost_cents = add_nullable_int(job.internal_cost_cents, usage.internal_cost_cents)
    job.provider_usage = append_usage_payload(existing=job.provider_usage, raw_payload=usage.raw_payload)


def add_nullable_int(existing: int | None, value: int | None) -> int | None:
    if value is None:
        return existing
    return (existing or 0) + value


def append_usage_payload(*, existing: object, raw_payload: dict[str, object] | None) -> dict[str, object] | None:
    if raw_payload is None:
        if existing is None or isinstance(existing, dict):
            return existing
        raise invalid_stored_usage()
    entries = extract_usage_entries(existing)
    return {"results": [*entries, raw_payload]}


def extract_usage_entries(existing: object) -> list[dict[str, object]]:
    if existing is None:
        return []
    if not isinstance(existing, dict):
        raise invalid_stored_usage()
    entries = existing.get("results")
    if not isinstance(entries, list):
        raise invalid_stored_usage()
    return validate_usage_entries(entries)


def validate_usage_entries(entries: list[object]) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise invalid_stored_usage()
        result.append(entry)
    return result


def invalid_stored_usage() -> AppError:
    return AppError(code="provider_usage_invalid", message="stored provider usage invalid", status_code=500)
