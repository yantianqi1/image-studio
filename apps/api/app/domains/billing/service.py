from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.errors import AppError
from apps.api.app.domains.billing.credits import cents_to_price_credits
from apps.api.app.domains.billing.models import Wallet, WalletLedger, WalletReservation


def create_wallet(session: Session, *, user_id: int) -> Wallet:
    wallet = session.get(Wallet, user_id)
    if wallet is not None:
        return wallet
    balance = get_settings().signup_bonus_cents
    wallet = Wallet(user_id=user_id, balance_cents=balance, locked_cents=0, currency="CNY")
    session.add(wallet)
    session.flush()
    session.add(
        WalletLedger(
            user_id=user_id,
            amount_cents=balance,
            balance_after_cents=balance,
            reason="signup_bonus",
            reference_type="auth",
            reference_id=str(user_id),
        )
    )
    session.flush()
    return wallet


def get_wallet(session: Session, *, user_id: int) -> Wallet:
    wallet = session.get(Wallet, user_id)
    if wallet is None:
        raise AppError(code="wallet_not_found", message="wallet not found", status_code=404)
    return wallet


def list_wallet_ledger(session: Session, *, user_id: int) -> list[WalletLedger]:
    statement = select(WalletLedger).where(WalletLedger.user_id == user_id).order_by(WalletLedger.id.asc())
    return list(session.execute(statement).scalars())


def create_reservation(session: Session, *, user_id: int, amount_cents: int, reason: str) -> WalletReservation:
    wallet = get_wallet(session, user_id=user_id)
    available = wallet.balance_cents - wallet.locked_cents
    if available < amount_cents:
        raise AppError(code="balance_not_enough", message="insufficient balance", status_code=409)
    wallet.locked_cents += amount_cents
    reservation = WalletReservation(user_id=user_id, amount_cents=amount_cents, reason=reason)
    session.add(reservation)
    session.flush()
    return reservation


def commit_reservation(session: Session, *, user_id: int, reservation_id: int) -> WalletReservation:
    wallet = get_wallet(session, user_id=user_id)
    reservation = require_reservation(session, user_id=user_id, reservation_id=reservation_id)
    if reservation.status != "reserved":
        raise AppError(code="reservation_not_active", message="reservation is not active", status_code=409)
    wallet.locked_cents -= reservation.amount_cents
    wallet.balance_cents -= reservation.amount_cents
    wallet.updated_at = datetime.utcnow()
    reservation.status = "committed"
    reservation.committed_at = datetime.utcnow()
    session.add(
        WalletLedger(
            user_id=user_id,
            amount_cents=-reservation.amount_cents,
            balance_after_cents=wallet.balance_cents,
            reason=reservation.reason,
            reference_type=reservation.reference_type,
            reference_id=reservation.reference_id or str(reservation.id),
        )
    )
    session.flush()
    return reservation


def release_reservation(session: Session, *, user_id: int, reservation_id: int) -> WalletReservation:
    wallet = get_wallet(session, user_id=user_id)
    reservation = require_reservation(session, user_id=user_id, reservation_id=reservation_id)
    if reservation.status != "reserved":
        raise AppError(code="reservation_not_active", message="reservation is not active", status_code=409)
    wallet.locked_cents -= reservation.amount_cents
    wallet.updated_at = datetime.utcnow()
    reservation.status = "released"
    reservation.released_at = datetime.utcnow()
    session.flush()
    return reservation


def credit_wallet(
    session: Session,
    *,
    user_id: int,
    amount_cents: int,
    reason: str,
    reference_type: str,
    reference_id: str,
) -> Wallet:
    wallet = get_wallet(session, user_id=user_id)
    wallet.balance_cents += amount_cents
    wallet.updated_at = datetime.utcnow()
    session.add(
        WalletLedger(
            user_id=user_id,
            amount_cents=amount_cents,
            balance_after_cents=wallet.balance_cents,
            reason=reason,
            reference_type=reference_type,
            reference_id=reference_id,
        )
    )
    session.flush()
    return wallet


def adjust_wallet_balance(
    session: Session,
    *,
    user_id: int,
    amount_cents: int,
    reason: str,
    reference_type: str,
    reference_id: str,
) -> Wallet:
    wallet = get_wallet(session, user_id=user_id)
    next_balance = wallet.balance_cents + amount_cents
    if next_balance < wallet.locked_cents or next_balance < 0:
        raise AppError(code="balance_not_enough", message="insufficient balance", status_code=409)
    wallet.balance_cents = next_balance
    wallet.updated_at = datetime.utcnow()
    session.add(
        WalletLedger(
            user_id=user_id,
            amount_cents=amount_cents,
            balance_after_cents=wallet.balance_cents,
            reason=reason,
            reference_type=reference_type,
            reference_id=reference_id,
        )
    )
    session.flush()
    return wallet


def require_reservation(session: Session, *, user_id: int, reservation_id: int) -> WalletReservation:
    reservation = session.get(WalletReservation, reservation_id)
    if reservation is None or reservation.user_id != user_id:
        raise AppError(code="reservation_not_found", message="reservation not found", status_code=404)
    return reservation


def wallet_payload(wallet: Wallet) -> dict[str, object]:
    return {
        "user_id": wallet.user_id,
        "balance_cents": wallet.balance_cents,
        "balance_credits": cents_to_price_credits(wallet.balance_cents),
        "locked_cents": wallet.locked_cents,
        "locked_credits": cents_to_price_credits(wallet.locked_cents),
        "currency": wallet.currency,
    }


def ledger_payload(entry: WalletLedger) -> dict[str, object]:
    return {
        "id": entry.id,
        "amount_cents": entry.amount_cents,
        "amount_credits": cents_to_price_credits(entry.amount_cents),
        "balance_after_cents": entry.balance_after_cents,
        "balance_after_credits": cents_to_price_credits(entry.balance_after_cents),
        "reason": entry.reason,
        "reference_type": entry.reference_type,
        "reference_id": entry.reference_id,
        "created_at": entry.created_at.isoformat(),
    }
