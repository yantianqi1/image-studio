from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import Date, case, cast, func, select
from sqlalchemy.orm import Session

from apps.api.app.domains.image.models import ImageJob


def get_image_job_stats(session: Session) -> dict:
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = today_start - timedelta(days=7)
    two_weeks_ago = today_start - timedelta(days=14)

    # Single query for overview + revenue (replaces 6 separate queries)
    overview_row = session.execute(
        select(
            func.count(ImageJob.id),
            func.count(ImageJob.id).filter(ImageJob.status == "succeeded"),
            func.count(ImageJob.id).filter(ImageJob.status == "failed"),
            func.coalesce(func.sum(ImageJob.charge_cents), 0),
            func.coalesce(func.sum(ImageJob.charge_cents).filter(ImageJob.created_at >= today_start), 0),
            func.coalesce(func.sum(ImageJob.charge_cents).filter(ImageJob.created_at >= week_ago), 0),
        )
    ).one()

    total = int(overview_row[0])
    succeeded = int(overview_row[1])
    failed = int(overview_row[2])
    total_revenue = int(overview_row[3])
    today_revenue = int(overview_row[4])
    week_revenue = int(overview_row[5])
    success_rate = round(succeeded / total, 4) if total > 0 else 0

    avg_duration_seconds = _avg_duration(session)

    model_distribution = _group_count(session, ImageJob.model_code)
    source_distribution = _group_count(session, ImageJob.source)
    size_distribution = _group_count(session, ImageJob.size)
    quality_distribution = _group_count(session, ImageJob.quality)

    daily_trend = _daily_trend(session, since=two_weeks_ago)

    return {
        "overview": {
            "total": total,
            "succeeded": succeeded,
            "failed": failed,
            "success_rate": success_rate,
        },
        "revenue": {
            "total_cents": total_revenue,
            "today_cents": today_revenue,
            "week_cents": week_revenue,
        },
        "performance": {
            "avg_duration_seconds": avg_duration_seconds,
        },
        "distribution": {
            "model": model_distribution,
            "source": source_distribution,
            "size": size_distribution,
            "quality": quality_distribution,
        },
        "daily_trend": daily_trend,
    }


def _avg_duration(session: Session) -> float | None:
    stmt = session.query(
        func.avg(func.julianday(ImageJob.finished_at) - func.julianday(ImageJob.started_at))
    ).filter(
        ImageJob.status == "succeeded",
        ImageJob.started_at.is_not(None),
        ImageJob.finished_at.is_not(None),
    )
    result = stmt.scalar()
    if result is None:
        return None
    return round(float(result) * 86400, 1)


def _group_count(session: Session, column) -> list[dict]:
    rows = (
        session.query(column, func.count(ImageJob.id))
        .group_by(column)
        .order_by(func.count(ImageJob.id).desc())
        .all()
    )
    return [{"key": key or "unknown", "count": count} for key, count in rows]


def _daily_trend(session: Session, *, since: datetime) -> list[dict]:
    date_col = cast(ImageJob.created_at, Date)
    rows = (
        session.query(
            date_col.label("date"),
            func.count(ImageJob.id).label("count"),
            func.coalesce(func.sum(ImageJob.charge_cents), 0).label("revenue_cents"),
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
            "revenue_cents": int(row.revenue_cents),
            "succeeded": int(row.succeeded),
        }
        for row in rows
    ]
