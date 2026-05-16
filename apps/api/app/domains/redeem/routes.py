from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.service import get_user_by_token, require_admin
from apps.api.app.domains.billing.credits import cents_to_price_credits
from apps.api.app.domains.billing.service import wallet_payload
from apps.api.app.domains.redeem.schemas import CreateBatchRequest, RedeemRequest
from apps.api.app.domains.redeem.service import create_batch, list_codes, redeem_code

public_router = APIRouter(prefix="/redeem", tags=["public-redeem"])
admin_router = APIRouter(prefix="/redeem", tags=["admin-redeem"])


@public_router.post("/redeem")
def redeem(payload: RedeemRequest, request: Request, session: Session = Depends(get_db_session)):
    user = get_user_by_token(session, request.cookies.get(get_settings().user_session_cookie_name))
    _, wallet = redeem_code(session, user_id=user.id, code=payload.code)
    session.commit()
    return api_ok(wallet_payload(wallet))


@admin_router.post("/batches", status_code=status.HTTP_201_CREATED)
def create_code_batch(payload: CreateBatchRequest, request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    batch = create_batch(
        session,
        name=payload.name,
        credit_amount_cents=payload.credit_amount_cents,
        codes=payload.codes,
    )
    session.commit()
    return api_ok({
        "id": batch.id,
        "name": batch.name,
        "credit_amount_cents": batch.credit_amount_cents,
        "credit_amount_credits": cents_to_price_credits(batch.credit_amount_cents),
    })


@admin_router.get("/codes")
def get_codes(request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    rows = list_codes(session)
    return api_ok(
        [
            {
                "id": row.id,
                "code": row.code,
                "credit_amount_cents": row.credit_amount_cents,
                "credit_amount_credits": cents_to_price_credits(row.credit_amount_cents),
                "status": row.status,
                "redeemed_by_user_id": row.redeemed_by_user_id,
                "redeemed_at": row.redeemed_at.isoformat() if row.redeemed_at else None,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    )
