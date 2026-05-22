from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from apps.api.app.domains.image.models import ImageJob, ImageJobItem, ProviderRuntimeState

QUEUE_STATUSES = ("queued", "running", "succeeded", "failed", "cancelled", "dead_letter")


def get_image_job_stats(session: Session) -> dict:
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = today_start - timedelta(days=7)
    two_weeks_ago = today_start - timedelta(days=14)
    overview = _overview_stats(session, today_start=today_start, week_ago=week_ago)
    avg_duration_seconds = _avg_duration(session)
    item_stats = _item_runtime_stats(session)
    return {
        "overview": overview["overview"],
        "costs": overview["costs"],
        "performance": {
            "avg_duration_seconds": avg_duration_seconds,
            "queue_wait_seconds": item_stats["queue_wait_seconds"],
            "render_duration_seconds": item_stats["render_duration_seconds"],
        },
        "queue": item_stats["queue"],
        "provider_health": _provider_health(session),
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
    failed_rate = round(failed / total, 4) if total > 0 else 0
    return {
        "overview": {
            "total": total,
            "succeeded": succeeded,
            "failed": failed,
            "success_rate": success_rate,
            "failed_rate": failed_rate,
        },
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


def _item_runtime_stats(session: Session) -> dict[str, dict]:
    rows = session.execute(
        select(
            ImageJobItem.status,
            ImageJobItem.dead_letter_at,
            ImageJobItem.created_at,
            ImageJobItem.started_at,
            ImageJobItem.finished_at,
        )
    ).all()
    queue = {status: 0 for status in QUEUE_STATUSES}
    queue_waits: list[float] = []
    render_durations: list[float] = []
    for row in rows:
        queue[_display_item_status(row.status, row.dead_letter_at)] += 1
        _append_duration(queue_waits, row.created_at, row.started_at)
        _append_duration(render_durations, row.started_at, row.finished_at)
    return {
        "queue": queue,
        "queue_wait_seconds": _percentile_summary(queue_waits),
        "render_duration_seconds": _percentile_summary(render_durations),
    }


def _display_item_status(status: str, dead_letter_at: datetime | None) -> str:
    if dead_letter_at is not None:
        return "dead_letter"
    return status if status in QUEUE_STATUSES else "failed"


def _append_duration(values: list[float], start: datetime | None, end: datetime | None) -> None:
    if start is None or end is None or end < start:
        return
    values.append((end - start).total_seconds())


def _percentile_summary(values: list[float]) -> dict[str, float | None]:
    return {
        "p50": _percentile(values, 0.5),
        "p95": _percentile(values, 0.95),
    }


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    sorted_values = sorted(values)
    position = (len(sorted_values) - 1) * percentile
    lower_index = int(position)
    upper_index = min(lower_index + 1, len(sorted_values) - 1)
    weight = position - lower_index
    lower = sorted_values[lower_index]
    upper = sorted_values[upper_index]
    return round(lower + (upper - lower) * weight, 1)


def _provider_health(session: Session) -> dict[str, int]:
    rows = list(session.execute(select(ProviderRuntimeState)).scalars())
    counts = {"healthy": 0, "degraded": 0, "paused": 0, "circuit_open": 0, "failure_count": 0}
    for row in rows:
        if row.status in counts:
            counts[row.status] += 1
        counts["failure_count"] += row.failure_count
    return counts


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
