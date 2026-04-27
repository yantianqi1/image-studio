from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import Request
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.errors import AppError
from apps.api.app.core.security import sha256_hex
from apps.api.app.domains.public_quota.constants import (
    PUBLIC_QUOTA_FEATURES,
    PUBLIC_QUOTA_MODE_DAILY_GLOBAL,
    PUBLIC_QUOTA_MODE_PER_IP,
    PUBLIC_QUOTA_MODES,
    PUBLIC_QUOTA_TIMEZONE,
)
from apps.api.app.domains.public_quota.models import PublicQuotaBucket, PublicQuotaUsage
from apps.api.app.domains.settings.models import SiteSettings
from apps.api.app.domains.settings.service import get_settings_record

PUBLIC_QUOTA_EXHAUSTED_CODE = "public_quota_exhausted"
PUBLIC_QUOTA_INVALID_CODE = "public_quota_invalid"
PUBLIC_QUOTA_IP_UNAVAILABLE_CODE = "public_quota_ip_unavailable"
EMPTY_USED_COUNT = 0
MIN_REMAINING_COUNT = 0


def consume_public_quota(
    session: Session,
    *,
    request_ip: str | None,
    feature: str,
    reference_type: str,
    reference_id: str,
    units: int = 1,
    now: datetime | None = None,
) -> PublicQuotaUsage:
    return consume_public_quota_by_request_ip_hash(
        session,
        request_ip_hash=hash_request_ip(request_ip),
        feature=feature,
        reference_type=reference_type,
        reference_id=reference_id,
        units=units,
        now=now,
    )


def consume_public_quota_by_request_ip_hash(
    session: Session,
    *,
    request_ip_hash: str | None,
    feature: str,
    reference_type: str,
    reference_id: str,
    units: int = 1,
    now: datetime | None = None,
) -> PublicQuotaUsage:
    return _consume_public_quota(
        session,
        request_ip_hash=request_ip_hash,
        feature=feature,
        reference_type=reference_type,
        reference_id=reference_id,
        units=units,
        now=now,
    )


def get_public_quota_status(
    session: Session,
    *,
    request_ip: str | None,
    now: datetime | None = None,
) -> dict[str, object]:
    timestamp = normalize_timestamp(now)
    record = get_settings_record(session)
    mode = validate_quota_mode(record.public_quota_mode)
    limit_count = resolve_limit_count(record, mode)
    request_ip_hash = hash_request_ip(request_ip)
    bucket_key = resolve_bucket_key(mode=mode, request_ip_hash=request_ip_hash, now=timestamp)
    bucket = find_bucket(session, mode=mode, bucket_key=bucket_key)
    used_count = bucket.used_count if bucket is not None else EMPTY_USED_COUNT
    remaining_count = calculate_remaining_count(limit_count=limit_count, used_count=used_count)
    return {
        "mode": mode,
        "limit_count": limit_count,
        "used_count": used_count,
        "remaining_count": remaining_count,
        "exhausted": remaining_count <= MIN_REMAINING_COUNT,
    }


def _consume_public_quota(
    session: Session,
    *,
    request_ip_hash: str | None,
    feature: str,
    reference_type: str,
    reference_id: str,
    units: int,
    now: datetime | None,
) -> PublicQuotaUsage:
    timestamp = normalize_timestamp(now)
    record = get_settings_record(session)
    mode = validate_quota_mode(record.public_quota_mode)
    validate_feature(feature)
    validate_units(units)
    limit_count = resolve_limit_count(record, mode)
    bucket_key = resolve_bucket_key(mode=mode, request_ip_hash=request_ip_hash, now=timestamp)
    bucket = get_or_create_bucket(session, mode=mode, bucket_key=bucket_key, limit_count=limit_count, now=timestamp)
    reserve_bucket_units(session, bucket_id=bucket.id, units=units, now=timestamp)
    usage = PublicQuotaUsage(
        bucket_id=bucket.id,
        feature=feature,
        units=units,
        reference_type=reference_type,
        reference_id=reference_id,
        request_ip_hash=request_ip_hash,
        created_at=timestamp.replace(tzinfo=None),
    )
    session.add(usage)
    session.flush()
    return usage


def resolve_request_ip(request: Request) -> str | None:
    forwarded_for = normalize_optional_text(request.headers.get("x-forwarded-for"))
    if forwarded_for is not None:
        first_value = normalize_optional_text(forwarded_for.split(",", maxsplit=1)[0])
        if first_value is not None:
            return first_value
    if request.client is None:
        return None
    return normalize_optional_text(request.client.host)


def validate_quota_mode(mode: str) -> str:
    if mode not in PUBLIC_QUOTA_MODES:
        raise AppError(code=PUBLIC_QUOTA_INVALID_CODE, message="public quota mode is invalid", status_code=422)
    return mode


def validate_feature(feature: str) -> None:
    if feature not in PUBLIC_QUOTA_FEATURES:
        raise AppError(code=PUBLIC_QUOTA_INVALID_CODE, message="public quota feature is invalid", status_code=422)


def validate_units(units: int) -> None:
    if units <= 0:
        raise AppError(code=PUBLIC_QUOTA_INVALID_CODE, message="public quota units must be positive", status_code=422)


def resolve_limit_count(record: SiteSettings, mode: str) -> int:
    limit_count = (
        record.public_quota_daily_global_limit
        if mode == PUBLIC_QUOTA_MODE_DAILY_GLOBAL
        else record.public_quota_per_ip_limit
    )
    if limit_count <= 0:
        raise AppError(code=PUBLIC_QUOTA_INVALID_CODE, message="public quota limit must be positive", status_code=422)
    return limit_count


def resolve_bucket_key(*, mode: str, request_ip_hash: str | None, now: datetime) -> str:
    if mode == PUBLIC_QUOTA_MODE_DAILY_GLOBAL:
        return now.astimezone(ZoneInfo(PUBLIC_QUOTA_TIMEZONE)).date().isoformat()
    if mode == PUBLIC_QUOTA_MODE_PER_IP and request_ip_hash is not None:
        return request_ip_hash
    raise AppError(code=PUBLIC_QUOTA_IP_UNAVAILABLE_CODE, message="request ip is unavailable", status_code=422)


def find_bucket(session: Session, *, mode: str, bucket_key: str) -> PublicQuotaBucket | None:
    statement = select(PublicQuotaBucket).where(
        PublicQuotaBucket.quota_mode == mode,
        PublicQuotaBucket.quota_key == bucket_key,
    )
    return session.execute(statement).scalar_one_or_none()


def calculate_remaining_count(*, limit_count: int, used_count: int) -> int:
    remaining_count = limit_count - used_count
    if remaining_count < MIN_REMAINING_COUNT:
        return MIN_REMAINING_COUNT
    return remaining_count


def get_or_create_bucket(
    session: Session,
    *,
    mode: str,
    bucket_key: str,
    limit_count: int,
    now: datetime,
) -> PublicQuotaBucket:
    bucket = find_bucket(session, mode=mode, bucket_key=bucket_key)
    if bucket is None:
        bucket = PublicQuotaBucket(
            quota_mode=mode,
            quota_key=bucket_key,
            used_count=0,
            limit_count=limit_count,
            updated_at=now.replace(tzinfo=None),
        )
        session.add(bucket)
    else:
        bucket.limit_count = limit_count
    session.flush()
    return bucket


def reserve_bucket_units(session: Session, *, bucket_id: int, units: int, now: datetime) -> None:
    statement = (
        update(PublicQuotaBucket)
        .where(
            PublicQuotaBucket.id == bucket_id,
            PublicQuotaBucket.used_count + units <= PublicQuotaBucket.limit_count,
        )
        .values(
            used_count=PublicQuotaBucket.used_count + units,
            updated_at=now.replace(tzinfo=None),
        )
    )
    if session.execute(statement).rowcount != 1:
        raise AppError(code=PUBLIC_QUOTA_EXHAUSTED_CODE, message="public quota exhausted", status_code=403)


def hash_request_ip(request_ip: str | None) -> str | None:
    normalized = normalize_optional_text(request_ip)
    if normalized is None:
        return None
    return sha256_hex(f"{get_settings().session_secret}:{normalized}")


def normalize_timestamp(now: datetime | None) -> datetime:
    if now is None:
        return datetime.now(timezone.utc)
    if now.tzinfo is None:
        return now.replace(tzinfo=timezone.utc)
    return now.astimezone(timezone.utc)


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None
