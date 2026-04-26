from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.billing.service import credit_wallet
from apps.api.app.domains.redeem.models import ActivationCode, ActivationCodeBatch


def create_batch(
    session: Session,
    *,
    name: str,
    credit_amount_cents: int,
    codes: list[str],
) -> ActivationCodeBatch:
    batch = ActivationCodeBatch(name=name, credit_amount_cents=credit_amount_cents)
    session.add(batch)
    session.flush()
    for code in codes:
        session.add(
            ActivationCode(
                batch_id=batch.id,
                code=code,
                credit_amount_cents=credit_amount_cents,
            )
        )
    session.flush()
    return batch


def redeem_code(session: Session, *, user_id: int, code: str):
    code_row = session.execute(select(ActivationCode).where(ActivationCode.code == code)).scalar_one_or_none()
    if code_row is None:
        raise AppError(code="activation_code_not_found", message="activation code not found", status_code=404)
    if code_row.status != "unused":
        raise AppError(code="activation_code_redeemed", message="activation code already redeemed", status_code=409)
    code_row.status = "redeemed"
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

