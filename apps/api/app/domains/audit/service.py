from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from apps.api.app.core.errors import AppError
from apps.api.app.domains.audit.models import AdminActionLog
from apps.api.app.domains.audit.schemas import AdminActionLogListOptions


@dataclass(frozen=True)
class AdminActionLogListResult:
    items: list[AdminActionLog]
    total: int
    page: int
    page_size: int


def record_admin_action(
    session: Session,
    *,
    admin_user_id: int,
    action: str,
    target_type: str,
    target_id: int | str,
    reason: str,
    metadata: dict[str, Any] | None = None,
) -> AdminActionLog:
    stripped_reason = reason.strip()
    if not stripped_reason:
        raise AppError(code="audit_reason_required", message="audit reason is required", status_code=422)
    log = AdminActionLog(
        admin_user_id=admin_user_id,
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        reason=stripped_reason,
        metadata_json=metadata or {},
    )
    session.add(log)
    session.flush()
    return log


def list_admin_action_logs(session: Session, options: AdminActionLogListOptions) -> AdminActionLogListResult:
    filters = build_audit_filters(options)
    total = count_logs(session, filters)
    offset = (options.page - 1) * options.page_size
    statement = (
        select(AdminActionLog)
        .where(*filters)
        .order_by(AdminActionLog.id.asc())
        .offset(offset)
        .limit(options.page_size)
    )
    logs = list(session.execute(statement).scalars())
    return AdminActionLogListResult(items=logs, total=total, page=options.page, page_size=options.page_size)


def build_audit_filters(options: AdminActionLogListOptions) -> tuple[ColumnElement[bool], ...]:
    filters: list[ColumnElement[bool]] = []
    if options.action is not None:
        filters.append(AdminActionLog.action == options.action)
    if options.target_type is not None:
        filters.append(AdminActionLog.target_type == options.target_type)
    if options.target_id is not None:
        filters.append(AdminActionLog.target_id == options.target_id)
    if options.admin_user_id is not None:
        filters.append(AdminActionLog.admin_user_id == options.admin_user_id)
    if options.created_from is not None:
        filters.append(AdminActionLog.created_at >= options.created_from)
    if options.created_to is not None:
        filters.append(AdminActionLog.created_at <= options.created_to)
    return tuple(filters)


def count_logs(session: Session, filters: tuple[ColumnElement[bool], ...]) -> int:
    statement = select(func.count()).select_from(AdminActionLog).where(*filters)
    return int(session.execute(statement).scalar_one())


def audit_log_payload(log: AdminActionLog) -> dict[str, object]:
    return {
        "id": log.id,
        "admin_user_id": log.admin_user_id,
        "action": log.action,
        "target_type": log.target_type,
        "target_id": log.target_id,
        "reason": log.reason,
        "metadata": log.metadata_json,
        "created_at": log.created_at.isoformat(),
    }
