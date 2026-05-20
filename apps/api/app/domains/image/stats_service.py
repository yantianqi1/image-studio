from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from apps.api.app.domains.image.models import ImageJob


def get_image_job_stats(session: Session) -> dict:
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = today_start - timedelta(days=7)
    two_weeks_ago = today_start - timedelta(days=14)
    overview = _overview_stats(session, today_start=today_start, week_ago=week_ago)
    avg_duration_seconds = _avg_duration(session)
    return {
        "overview": overview["overview"],
        "costs": overview["costs"],
        "performance": {
            "avg_duration_seconds": avg_duration_seconds,
        },
        "distribution": {
            "model": _group_count(session, ImageJob.model_code),
            "source": _group_count(session, ImageJob.source),
            "size": _group_count(session, ImageJob.size),
            "quality": _group_count(session, ImageJob.quality),
        },
        "channel_costs": _channel_costs(session),
        "daily_trend": _daily_trend(session, since=two_weeks_ago),
    }


def _overview_stats(session: Session, *, today_start: datetime, week_ago: datetime) -> dict[str, dict]:
    row = session.execute(
        select(
            func.count(ImageJob.id),
            func.count(ImageJob.id).filter(ImageJob.status == "succeeded"),
            func.count(ImageJob.id).filter(ImageJob.status == "failed"),
            func.coalesce(func.sum(ImageJob.internal_cost_cents), 0),
            func.coalesce(func.sum(ImageJob.internal_cost_cents).filter(ImageJob.created_at >= today_start), 0),
            func.coalesce(func.sum(ImageJob.internal_cost_cents).filter(ImageJob.created_at >= week_ago), 0),
        )
    ).one()
    total = int(row[0])
    succeeded = int(row[1])
    failed = int(row[2])
    success_rate = round(succeeded / total, 4) if total > 0 else 0
    return {
        "overview": {"total": total, "succeeded": succeeded, "failed": failed, "success_rate": success_rate},
        "costs": {"total_cents": int(row[3]), "today_cents": int(row[4]), "week_cents": int(row[5])},
    }


def _avg_duration(session: Session) -> float | None:
    rows = session.execute(
        select(ImageJob.started_at, ImageJob.finished_at).where(
            ImageJob.status == "succeeded",
            ImageJob.started_at.is_not(None),
            ImageJob.finished_at.is_not(None),
        )
    ).all()
    durations = [
        (finished_at - started_at).total_seconds()
        for started_at, finished_at in rows
        if finished_at >= started_at
    ]
    if not durations:
        return None
    return round(sum(durations) / len(durations), 1)


def _group_count(session: Session, column) -> list[dict]:
    rows = (
        session.query(column, func.count(ImageJob.id))
        .group_by(column)
        .order_by(func.count(ImageJob.id).desc())
        .all()
    )
    return [{"key": key or "unknown", "count": count} for key, count in rows]


def _channel_costs(session: Session) -> list[dict]:
    rows = (
        session.query(
            ImageJob.model_code,
            func.count(ImageJob.id),
            func.coalesce(func.sum(ImageJob.raw_provider_cost_cents), 0),
            func.coalesce(func.sum(ImageJob.provider_fee_cents), 0),
            func.coalesce(func.sum(ImageJob.internal_cost_cents), 0),
        )
        .group_by(ImageJob.model_code)
        .order_by(func.sum(ImageJob.internal_cost_cents).desc())
        .all()
    )
    return [build_channel_cost_item(row) for row in rows]


def build_channel_cost_item(row) -> dict[str, object]:
    return {
        "key": row[0] or "unknown",
        "count": int(row[1]),
        "raw_provider_cost_cents": int(row[2]),
        "provider_fee_cents": int(row[3]),
        "internal_cost_cents": int(row[4]),
    }


def _daily_trend(session: Session, *, since: datetime) -> list[dict]:
    date_col = func.date(ImageJob.created_at)
    rows = (
        session.query(
            date_col.label("date"),
            func.count(ImageJob.id).label("count"),
            func.coalesce(func.sum(ImageJob.internal_cost_cents), 0).label("internal_cost_cents"),
            func.sum(case((ImageJob.status == "succeeded", 1), else_=0)).label("succeeded"),
        )
        .filter(ImageJob.created_at >= since)
        .group_by(date_col)
        .order_by(date_col)
        .all()
    )
    return [
        {
            "date": str(row.date),
            "count": row.count,
            "internal_cost_cents": int(row.internal_cost_cents),
            "succeeded": int(row.succeeded),
        }
        for row in rows
    ]
