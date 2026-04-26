from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.service import get_user_by_token, require_admin
from apps.api.app.domains.billing.schemas import ReservationCreateRequest, WalletAdjustmentRequest
from apps.api.app.domains.billing.service import (
    adjust_wallet_balance,
    commit_reservation,
    create_reservation,
    get_wallet,
    ledger_payload,
    list_wallet_ledger,
    release_reservation,
    wallet_payload,
)

public_router = APIRouter(prefix="/billing", tags=["public-billing"])
admin_router = APIRouter(prefix="/billing", tags=["admin-billing"])


def current_user_id(request: Request, session: Session) -> int:
    token = request.cookies.get(get_settings().user_session_cookie_name)
    return get_user_by_token(session, token).id


@public_router.get("/wallets/me")
def get_current_wallet(request: Request, session: Session = Depends(get_db_session)):
    return api_ok(wallet_payload(get_wallet(session, user_id=current_user_id(request, session))))


@public_router.get("/wallets/me/ledger")
def get_current_wallet_ledger(request: Request, session: Session = Depends(get_db_session)):
    entries = list_wallet_ledger(session, user_id=current_user_id(request, session))
    return api_ok([ledger_payload(entry) for entry in entries])


@public_router.post("/wallets/me/reservations", status_code=status.HTTP_201_CREATED)
def reserve_balance(
    request: Request,
    payload: ReservationCreateRequest,
    session: Session = Depends(get_db_session),
):
    reservation = create_reservation(
        session,
        user_id=current_user_id(request, session),
        amount_cents=payload.amount_cents,
        reason=payload.reason,
    )
    session.commit()
    return api_ok({"reservation_id": reservation.id, "status": reservation.status})


@public_router.post("/wallets/me/reservations/{reservation_id}/commit")
def commit_balance(
    reservation_id: int,
    request: Request,
    session: Session = Depends(get_db_session),
):
    reservation = commit_reservation(session, user_id=current_user_id(request, session), reservation_id=reservation_id)
    session.commit()
    return api_ok({"reservation_id": reservation.id, "status": reservation.status})


@public_router.post("/wallets/me/reservations/{reservation_id}/release")
def release_balance(
    reservation_id: int,
    request: Request,
    session: Session = Depends(get_db_session),
):
    reservation = release_reservation(session, user_id=current_user_id(request, session), reservation_id=reservation_id)
    session.commit()
    return api_ok({"reservation_id": reservation.id, "status": reservation.status})


@admin_router.get("/wallets/{user_id}")
def admin_get_wallet(user_id: int, request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    return api_ok(wallet_payload(get_wallet(session, user_id=user_id)))


@admin_router.get("/wallets/{user_id}/ledger")
def admin_get_wallet_ledger(user_id: int, request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    entries = list_wallet_ledger(session, user_id=user_id)
    return api_ok([ledger_payload(entry) for entry in entries])


@admin_router.post("/wallets/{user_id}/adjustments")
def admin_adjust_wallet(
    user_id: int,
    payload: WalletAdjustmentRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    wallet = adjust_wallet_balance(
        session,
        user_id=user_id,
        amount_cents=payload.amount_cents,
        reason=payload.reason,
        reference_type="admin_adjustment",
        reference_id=str(user_id),
    )
    session.commit()
    return api_ok(wallet_payload(wallet))
