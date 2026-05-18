from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.service import get_user_by_token, require_admin
from apps.api.app.domains.audit.service import record_admin_action
from apps.api.app.domains.billing.credits import cents_to_price_credits
from apps.api.app.domains.billing.service import wallet_payload
from apps.api.app.domains.redeem.schemas import CreateBatchRequest, DisableBatchRequest, DisableCodeRequest, RedeemRequest
from apps.api.app.domains.redeem.service import (
    create_batch,
    disable_batch,
    disable_code,
    get_batch_summary,
    list_batch_codes,
    list_batches,
    list_codes,
    redeem_code,
)

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
    admin = require_admin(request, session)
    result = create_batch(
        session,
        name=payload.name,
        credit_amount_cents=payload.credit_amount_cents,
        quantity=payload.quantity,
        prefix=payload.prefix,
        expires_at=payload.expires_at,
        note=payload.note,
    )
    record_admin_action(
        session,
        admin_user_id=admin.id,
        action="redeem.batch.create",
        target_type="redeem_batch",
        target_id=result.batch.id,
        reason=payload.reason,
        metadata={
            "quantity": payload.quantity,
            "credit_amount_cents": payload.credit_amount_cents,
            "prefix": payload.prefix,
            "expires_at": result.batch.expires_at.isoformat() if result.batch.expires_at else None,
            "note": result.batch.note,
        },
    )
    session.commit()
    return api_ok(batch_payload(result))


@admin_router.get("/batches")
def get_batches(request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    summaries = list_batches(session)
    return api_ok([batch_summary_payload(summary) for summary in summaries])


@admin_router.get("/batches/{batch_id}")
def get_batch(batch_id: int, request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    summary = get_batch_summary(session, batch_id)
    return api_ok(batch_detail_payload(summary))


@admin_router.get("/batches/{batch_id}/codes")
def get_batch_codes(batch_id: int, request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    summary = get_batch_summary(session, batch_id)
    rows = list_batch_codes(session, batch_id=batch_id)
    return api_ok([batch_code_payload(row, expires_at=summary.batch.expires_at) for row in rows])


@admin_router.post("/batches/{batch_id}/disable")
def disable_redeem_batch(
    batch_id: int,
    payload: DisableBatchRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    admin = require_admin(request, session)
    result = disable_batch(session, batch_id=batch_id)
    record_admin_action(
        session,
        admin_user_id=admin.id,
        action="redeem.batch.disable",
        target_type="redeem_batch",
        target_id=batch_id,
        reason=payload.reason,
        metadata={
            "status_from": result.status_from,
            "status_to": result.summary.batch.status,
            "disabled_codes_count": result.disabled_codes_count,
            "quantity": result.summary.quantity,
        },
    )
    session.commit()
    return api_ok(batch_detail_payload(result.summary))


@admin_router.post("/codes/{code_id}/disable")
def disable_redeem_code(
    code_id: int,
    payload: DisableCodeRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    admin = require_admin(request, session)
    result = disable_code(session, code_id=code_id)
    record_admin_action(
        session,
        admin_user_id=admin.id,
        action="redeem.code.disable",
        target_type="redeem_code",
        target_id=code_id,
        reason=payload.reason,
        metadata={
            "status_from": result.status_from,
            "status_to": result.code.status,
            "batch_id": result.batch.id,
        },
    )
    session.commit()
    return api_ok(batch_code_payload(result.code, expires_at=result.batch.expires_at))


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
                "expires_at": None,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    )


def batch_payload(result) -> dict[str, object]:
    return {
        "id": result.batch.id,
        "name": result.batch.name,
        "credit_amount_cents": result.batch.credit_amount_cents,
        "credit_amount_credits": cents_to_price_credits(result.batch.credit_amount_cents),
        "quantity": len(result.codes),
        "codes": result.codes,
        "status": result.batch.status,
        "expires_at": result.batch.expires_at.isoformat() if result.batch.expires_at else None,
        "note": result.batch.note,
        "created_at": result.batch.created_at.isoformat(),
    }


def batch_summary_payload(summary) -> dict[str, object]:
    return {
        "id": summary.batch.id,
        "name": summary.batch.name,
        "credit_amount_cents": summary.batch.credit_amount_cents,
        "credit_amount_credits": cents_to_price_credits(summary.batch.credit_amount_cents),
        "quantity": summary.quantity,
        "redeemed_quantity": summary.redeemed_quantity,
        "disabled_quantity": summary.disabled_quantity,
        "expired_quantity": summary.expired_quantity,
        "unused_quantity": summary.unused_quantity,
        "status": summary.batch.status,
        "expires_at": summary.batch.expires_at.isoformat() if summary.batch.expires_at else None,
        "note": summary.batch.note,
        "created_at": summary.batch.created_at.isoformat(),
    }


def batch_detail_payload(summary) -> dict[str, object]:
    return {
        "id": summary.batch.id,
        "name": summary.batch.name,
        "credit_amount_cents": summary.batch.credit_amount_cents,
        "credit_amount_credits": cents_to_price_credits(summary.batch.credit_amount_cents),
        "quantity": summary.quantity,
        "redeemed_quantity": summary.redeemed_quantity,
        "disabled_quantity": summary.disabled_quantity,
        "expired_quantity": summary.expired_quantity,
        "unused_quantity": summary.unused_quantity,
        "status": summary.batch.status,
        "expires_at": summary.batch.expires_at.isoformat() if summary.batch.expires_at else None,
        "note": summary.batch.note,
        "created_at": summary.batch.created_at.isoformat(),
    }


def batch_code_payload(row, *, expires_at) -> dict[str, object]:
    return {
        "id": row.id,
        "code": row.code,
        "credit_amount_cents": row.credit_amount_cents,
        "credit_amount_credits": cents_to_price_credits(row.credit_amount_cents),
        "status": row.status,
        "redeemed_by_user_id": row.redeemed_by_user_id,
        "redeemed_at": row.redeemed_at.isoformat() if row.redeemed_at else None,
        "expires_at": expires_at.isoformat() if expires_at else None,
        "created_at": row.created_at.isoformat(),
    }
