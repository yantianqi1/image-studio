from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.billing.service import credit_wallet
from apps.api.app.domains.redeem.models import ActivationCode, ActivationCodeBatch

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_SEGMENT_COUNT = 3
CODE_SEGMENT_LENGTH = 4
MAX_CODE_GENERATION_ATTEMPTS = 20
REDEEM_BATCH_STATUS_ACTIVE = "active"
REDEEM_BATCH_STATUS_DISABLED = "disabled"
REDEEM_CODE_STATUS_UNUSED = "unused"
REDEEM_CODE_STATUS_REDEEMED = "redeemed"
REDEEM_CODE_STATUS_DISABLED = "disabled"


@dataclass(frozen=True)
class CreatedBatch:
    batch: ActivationCodeBatch
    codes: list[str]


@dataclass(frozen=True)
class BatchSummary:
    batch: ActivationCodeBatch
    quantity: int
    redeemed_quantity: int
    disabled_quantity: int
    expired_quantity: int

    @property
    def unused_quantity(self) -> int:
        return self.quantity - self.redeemed_quantity - self.disabled_quantity - self.expired_quantity


@dataclass(frozen=True)
class DisabledBatch:
    summary: BatchSummary
    status_from: str
    disabled_codes_count: int


@dataclass(frozen=True)
class DisabledCode:
    code: ActivationCode
    batch: ActivationCodeBatch
    status_from: str


def create_batch(
    session: Session,
    *,
    name: str,
    credit_amount_cents: int,
    quantity: int,
    prefix: str | None,
    expires_at: datetime | None,
    note: str,
) -> CreatedBatch:
    batch = ActivationCodeBatch(
        name=name,
        credit_amount_cents=credit_amount_cents,
        expires_at=normalize_datetime(expires_at),
        note=note,
    )
    session.add(batch)
    session.flush()
    codes = create_codes(session, batch=batch, quantity=quantity, prefix=prefix)
    session.flush()
    return CreatedBatch(batch=batch, codes=codes)


def redeem_code(session: Session, *, user_id: int, code: str):
    code_row = get_code(session, code)
    batch = session.get(ActivationCodeBatch, code_row.batch_id)
    require_redeemable_batch(batch)
    require_unused_code(code_row)
    code_row.status = REDEEM_CODE_STATUS_REDEEMED
    code_row.redeemed_by_user_id = user_id
    code_row.redeemed_at = datetime.utcnow()
    wallet = credit_wallet(
        session,
        user_id=user_id,
        amount_cents=code_row.credit_amount_cents,
        reason="activation_code_redeem",
        reference_type="activation_code",
        reference_id=str(code_row.id),
    )
    session.flush()
    return code_row, wallet


def list_codes(session: Session) -> list[ActivationCode]:
    return list(session.execute(select(ActivationCode).order_by(ActivationCode.id.asc())).scalars())


def list_batches(session: Session) -> list[BatchSummary]:
    batches = list(session.execute(select(ActivationCodeBatch).order_by(ActivationCodeBatch.id.asc())).scalars())
    return [build_batch_summary(batch=batch, codes=list_batch_codes(session, batch_id=batch.id)) for batch in batches]


def get_batch_summary(session: Session, batch_id: int) -> BatchSummary:
    batch = require_batch(session, batch_id)
    return build_batch_summary(batch=batch, codes=list_batch_codes(session, batch_id=batch.id))


def list_batch_codes(session: Session, *, batch_id: int) -> list[ActivationCode]:
    statement = select(ActivationCode).where(ActivationCode.batch_id == batch_id).order_by(ActivationCode.id.asc())
    return list(session.execute(statement).scalars())


def disable_batch(session: Session, *, batch_id: int) -> DisabledBatch:
    batch = require_batch(session, batch_id)
    status_from = batch.status
    if status_from == REDEEM_BATCH_STATUS_DISABLED:
        raise AppError(code="activation_code_batch_disabled", message="activation code batch already disabled", status_code=409)
    disabled_codes_count = 0
    for code in list_batch_codes(session, batch_id=batch.id):
        if code.status == REDEEM_CODE_STATUS_UNUSED:
            code.status = REDEEM_CODE_STATUS_DISABLED
            disabled_codes_count += 1
    batch.status = REDEEM_BATCH_STATUS_DISABLED
    session.flush()
    return DisabledBatch(
        summary=get_batch_summary(session, batch.id),
        status_from=status_from,
        disabled_codes_count=disabled_codes_count,
    )


def disable_code(session: Session, *, code_id: int) -> DisabledCode:
    code_row = session.get(ActivationCode, code_id)
    if code_row is None:
        raise AppError(code="activation_code_not_found", message="activation code not found", status_code=404)
    if code_row.status == REDEEM_CODE_STATUS_REDEEMED:
        raise AppError(code="activation_code_redeemed", message="activation code already redeemed", status_code=409)
    if code_row.status == REDEEM_CODE_STATUS_DISABLED:
        raise AppError(code="activation_code_disabled", message="activation code already disabled", status_code=409)
    batch = require_batch(session, code_row.batch_id)
    status_from = code_row.status
    code_row.status = REDEEM_CODE_STATUS_DISABLED
    session.flush()
    return DisabledCode(code=code_row, batch=batch, status_from=status_from)


def create_codes(
    session: Session,
    *,
    batch: ActivationCodeBatch,
    quantity: int,
    prefix: str | None,
) -> list[str]:
    codes: list[str] = []
    existing_codes: set[str] = set()
    for _ in range(quantity):
        code = create_unique_code(session, prefix=prefix, existing_codes=existing_codes)
        session.add(ActivationCode(batch_id=batch.id, code=code, credit_amount_cents=batch.credit_amount_cents))
        codes.append(code)
        existing_codes.add(code)
    return codes


def build_batch_summary(*, batch: ActivationCodeBatch, codes: list[ActivationCode]) -> BatchSummary:
    redeemed_quantity = count_codes_with_status(codes, REDEEM_CODE_STATUS_REDEEMED)
    disabled_quantity = count_codes_with_status(codes, REDEEM_CODE_STATUS_DISABLED)
    expired_quantity = count_expired_codes(batch, codes)
    return BatchSummary(
        batch=batch,
        quantity=len(codes),
        redeemed_quantity=redeemed_quantity,
        disabled_quantity=disabled_quantity,
        expired_quantity=expired_quantity,
    )


def count_codes_with_status(codes: list[ActivationCode], status: str) -> int:
    return sum(1 for code in codes if code.status == status)


def count_expired_codes(batch: ActivationCodeBatch, codes: list[ActivationCode]) -> int:
    if not is_expired_batch(batch):
        return 0
    return sum(1 for code in codes if code.status == REDEEM_CODE_STATUS_UNUSED)


def create_unique_code(session: Session, *, prefix: str | None, existing_codes: set[str]) -> str:
    for _ in range(MAX_CODE_GENERATION_ATTEMPTS):
        code = build_activation_code(prefix)
        if code in existing_codes or code_exists(session, code):
            continue
        return code
    raise AppError(code="activation_code_generation_failed", message="activation code generation failed", status_code=500)


def build_activation_code(prefix: str | None) -> str:
    segments = [
        "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_SEGMENT_LENGTH))
        for _ in range(CODE_SEGMENT_COUNT)
    ]
    code = "-".join(segments)
    return f"{prefix}-{code}" if prefix else code


def code_exists(session: Session, code: str) -> bool:
    statement = select(ActivationCode.id).where(ActivationCode.code == code)
    return session.execute(statement).scalar_one_or_none() is not None


def get_code(session: Session, code: str) -> ActivationCode:
    code_row = session.execute(select(ActivationCode).where(ActivationCode.code == code)).scalar_one_or_none()
    if code_row is None:
        raise AppError(code="activation_code_not_found", message="activation code not found", status_code=404)
    return code_row


def require_batch(session: Session, batch_id: int) -> ActivationCodeBatch:
    batch = session.get(ActivationCodeBatch, batch_id)
    if batch is None:
        raise AppError(code="activation_code_batch_not_found", message="activation code batch not found", status_code=404)
    return batch


def require_unused_code(code_row: ActivationCode) -> None:
    if code_row.status == REDEEM_CODE_STATUS_REDEEMED:
        raise AppError(code="activation_code_redeemed", message="activation code already redeemed", status_code=409)
    if code_row.status == REDEEM_CODE_STATUS_DISABLED:
        raise AppError(code="activation_code_disabled", message="activation code disabled", status_code=409)
    if code_row.status != REDEEM_CODE_STATUS_UNUSED:
        raise AppError(code="activation_code_unavailable", message="activation code unavailable", status_code=409)


def require_redeemable_batch(batch: ActivationCodeBatch | None) -> None:
    if batch is None or batch.status != REDEEM_BATCH_STATUS_ACTIVE:
        raise AppError(code="activation_code_batch_inactive", message="activation code batch is inactive", status_code=409)
    if is_expired_batch(batch):
        raise AppError(code="activation_code_expired", message="activation code expired", status_code=409)


def is_expired_batch(batch: ActivationCodeBatch) -> bool:
    return batch.expires_at is not None and batch.expires_at <= datetime.utcnow()


def normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)
