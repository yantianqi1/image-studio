from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text

from go_image_api_cutover_decision import build_cutover_decision
from go_image_api_cutover_evidence import ExternalEvidence


CREATE_5XX_RATE_MAX = 0.005
ITEM_FAILURE_RATE_MAX = 0.03
PROVIDER_FAILURE_RATE_MAX = 0.03
QUEUE_WAIT_P95_MAX_SECONDS = 120.0
OUTBOX_PENDING_OLDEST_MAX_SECONDS = 60.0
MIN_WINDOW_HOURS = 24
MIN_ITEMS_IN_WINDOW = 1
MIN_GO_CREATE_UPSTREAM_COUNT = 1
ZERO_ALLOWED = 0
EXIT_GATE_FAILED = 2
MIN_DIRECTION = "min"
MAX_DIRECTION = "max"
STRICT_MAX_DIRECTION = "strict_max"
PROVIDER_ERROR_CODES = frozenset({"provider_request_failed", "provider_image_download_failed"})
REQUIRED_CHECK_NAMES = (
    "items_in_window",
    "create_5xx_rate",
    "create_go_upstream_count",
    "create_non_go_upstream_count",
    "create_unknown_upstream_count",
    "item_terminal_failure_rate",
    "provider_failure_rate",
    "invalid_queue_timestamp_count",
    "queue_wait_p95_seconds",
    "invalid_render_timestamp_count",
    "render_duration_p95_seconds",
    "outbox_pending_oldest_age_seconds",
    "dead_letter_growth",
    "worker_heartbeat_failed_count",
    "asset_missing_count",
    "asset_mismatched_count",
    "rollback_drill_passed",
)


def build_report(engine, *, window_hours: int, evidence: ExternalEvidence, dead_letter_growth_max: int) -> dict[str, Any]:
    if window_hours < MIN_WINDOW_HOURS:
        raise ValueError(f"window_hours must be at least {MIN_WINDOW_HOURS}")
    if dead_letter_growth_max < ZERO_ALLOWED:
        raise ValueError("dead_letter_growth_max must be zero or positive")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    since = now - timedelta(hours=window_hours)
    with engine.connect() as connection:
        items = fetch_items(connection, since=since)
        outbox = fetch_outbox_lag(connection, now=now)
    item_stats = summarize_items(items, since=since)
    checks = build_checks(
        evidence=evidence,
        item_stats=item_stats,
        item_count=len(items),
        outbox=outbox,
        dead_letter_growth_max=dead_letter_growth_max,
    )
    passed = all(check["status"] == "pass" for check in checks)
    return {
        "passed": passed,
        "window_hours": window_hours,
        "cutover_decision": build_cutover_decision(passed, checks),
        "checks": checks,
        "summary": {"items_in_window": len(items)},
    }


def fetch_items(connection, *, since: datetime) -> list[dict[str, Any]]:
    rows = connection.execute(
        text("""
            SELECT status, available_at, started_at, finished_at, dead_letter_at, error_code, last_error_code
            FROM image_job_items
            WHERE COALESCE(finished_at, dead_letter_at, started_at, created_at) >= :since
        """),
        {"since": since},
    )
    return [dict(row._mapping) for row in rows]


def fetch_outbox_lag(connection, *, now: datetime) -> dict[str, Any]:
    row = connection.execute(
        text("""
            SELECT COUNT(*) AS pending_count, MIN(available_at) AS oldest_available_at
            FROM outbox_events
            WHERE status = 'pending' AND available_at <= :now
        """),
        {"now": now},
    ).one()
    oldest = parse_datetime(row.oldest_available_at)
    age = (now - oldest).total_seconds() if oldest else 0.0
    return {"pending_count": int(row.pending_count), "oldest_age_seconds": round(age, 1)}


def summarize_items(items: list[dict[str, Any]], *, since: datetime) -> dict[str, Any]:
    terminal_total = 0
    failed_total = 0
    dead_letter_growth = 0
    provider_failure_total = 0
    queue_waits: list[float] = []
    render_durations: list[float] = []
    invalid_queue_timestamp_count = 0
    invalid_render_timestamp_count = 0
    for item in items:
        status = str(item["status"])
        dead_letter_at = parse_datetime(item["dead_letter_at"])
        terminal_total += terminal_count(status=status, dead_letter_at=dead_letter_at)
        failed_total += failed_count(status=status, dead_letter_at=dead_letter_at)
        dead_letter_growth += int(dead_letter_at is not None and dead_letter_at >= since)
        provider_failure_total += int(has_provider_error(item))
        invalid_queue_timestamp_count += append_duration(queue_waits, item["available_at"], item["started_at"])
        invalid_render_timestamp_count += append_duration(render_durations, item["started_at"], item["finished_at"])
    return {
        "terminal_total": terminal_total,
        "failed_total": failed_total,
        "failure_rate": safe_rate(failed_total, terminal_total),
        "provider_failure_rate": safe_rate(provider_failure_total, len(items)),
        "dead_letter_growth": dead_letter_growth,
        "queue_wait_p95_seconds": percentile(queue_waits, 0.95),
        "render_duration_p95_seconds": percentile(render_durations, 0.95),
        "invalid_queue_timestamp_count": invalid_queue_timestamp_count,
        "invalid_render_timestamp_count": invalid_render_timestamp_count,
    }


def build_checks(
    *,
    evidence: ExternalEvidence,
    item_stats: dict[str, Any],
    item_count: int,
    outbox: dict[str, Any],
    dead_letter_growth_max: int,
) -> list[dict[str, Any]]:
    return [
        threshold_check("items_in_window", item_count, MIN_ITEMS_IN_WINDOW, MIN_DIRECTION),
        threshold_check("create_5xx_rate", evidence.create_5xx_rate, CREATE_5XX_RATE_MAX, STRICT_MAX_DIRECTION),
        threshold_check("create_go_upstream_count", evidence.create_go_upstream_count, MIN_GO_CREATE_UPSTREAM_COUNT, MIN_DIRECTION),
        threshold_check("create_non_go_upstream_count", evidence.create_non_go_upstream_count, ZERO_ALLOWED, MAX_DIRECTION),
        threshold_check("create_unknown_upstream_count", evidence.create_unknown_upstream_count, ZERO_ALLOWED, MAX_DIRECTION),
        threshold_check("item_terminal_failure_rate", item_stats["failure_rate"], ITEM_FAILURE_RATE_MAX, STRICT_MAX_DIRECTION),
        threshold_check("provider_failure_rate", item_stats["provider_failure_rate"], PROVIDER_FAILURE_RATE_MAX, STRICT_MAX_DIRECTION),
        threshold_check("invalid_queue_timestamp_count", item_stats["invalid_queue_timestamp_count"], ZERO_ALLOWED, MAX_DIRECTION),
        threshold_check("queue_wait_p95_seconds", item_stats["queue_wait_p95_seconds"], QUEUE_WAIT_P95_MAX_SECONDS, STRICT_MAX_DIRECTION),
        threshold_check("invalid_render_timestamp_count", item_stats["invalid_render_timestamp_count"], ZERO_ALLOWED, MAX_DIRECTION),
        threshold_check(
            "render_duration_p95_seconds",
            item_stats["render_duration_p95_seconds"],
            evidence.render_duration_p95_threshold_seconds,
            MAX_DIRECTION,
        ),
        threshold_check("outbox_pending_oldest_age_seconds", outbox["oldest_age_seconds"], OUTBOX_PENDING_OLDEST_MAX_SECONDS, STRICT_MAX_DIRECTION),
        threshold_check("dead_letter_growth", item_stats["dead_letter_growth"], dead_letter_growth_max, MAX_DIRECTION),
        threshold_check("worker_heartbeat_failed_count", evidence.worker_heartbeat_failed_count, ZERO_ALLOWED, MAX_DIRECTION),
        threshold_check("asset_missing_count", evidence.asset_missing_count, ZERO_ALLOWED, MAX_DIRECTION),
        threshold_check("asset_mismatched_count", evidence.asset_mismatched_count, ZERO_ALLOWED, MAX_DIRECTION),
        true_check("rollback_drill_passed", evidence.rollback_drill_passed),
    ]


def threshold_check(name: str, value: float | int | None, threshold: float | int | None, direction: str) -> dict[str, Any]:
    if value is None or threshold is None:
        return {"name": name, "status": "unknown", "value": value, "threshold": threshold}
    if direction == STRICT_MAX_DIRECTION:
        passed = value < threshold
    elif direction == MAX_DIRECTION:
        passed = value <= threshold
    elif direction == MIN_DIRECTION:
        passed = value >= threshold
    else:
        raise ValueError(f"unsupported threshold direction: {direction}")
    return {"name": name, "status": "pass" if passed else "fail", "value": value, "threshold": threshold}


def true_check(name: str, value: bool | None) -> dict[str, Any]:
    if value is None:
        return {"name": name, "status": "unknown", "value": value, "threshold": True}
    return {"name": name, "status": "pass" if value else "fail", "value": value, "threshold": True}


def terminal_count(*, status: str, dead_letter_at: datetime | None) -> int:
    return int(dead_letter_at is not None or status in {"succeeded", "failed", "dead_letter"})


def failed_count(*, status: str, dead_letter_at: datetime | None) -> int:
    return int(dead_letter_at is not None or status in {"failed", "dead_letter"})


def has_provider_error(item: dict[str, Any]) -> bool:
    return item.get("error_code") in PROVIDER_ERROR_CODES or item.get("last_error_code") in PROVIDER_ERROR_CODES


def append_duration(values: list[float], start: Any, end: Any) -> int:
    start_dt = parse_datetime(start)
    end_dt = parse_datetime(end)
    if start_dt is None or end_dt is None:
        return 0
    if end_dt < start_dt:
        return 1
    values.append((end_dt - start_dt).total_seconds())
    return 0


def parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return value
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    text_value = str(value).replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text_value)
    if parsed.tzinfo is None:
        return parsed
    return parsed.astimezone(timezone.utc).replace(tzinfo=None)


def safe_rate(numerator: int, denominator: int) -> float | None:
    if denominator == 0:
        return None
    return round(numerator / denominator, 4)


def percentile(values: list[float], ratio: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * ratio
    lower_index = int(position)
    upper_index = min(lower_index + 1, len(ordered) - 1)
    weight = position - lower_index
    return round(ordered[lower_index] + (ordered[upper_index] - ordered[lower_index]) * weight, 1)


def human_report(report: dict[str, Any]) -> str:
    decision = report["cutover_decision"]
    lines = [
        f"passed={str(report['passed']).lower()}",
        f"window_hours={report['window_hours']}",
        f"phase8_status={decision['phase8_status']}",
        f"go_image_api_read_default_allowed={str(decision['go_image_api_read_default_allowed']).lower()}",
        f"go_image_api_create_default_allowed={str(decision['go_image_api_create_default_allowed']).lower()}",
        f"next_action={decision['next_action']}",
    ]
    lines.extend(
        f"{check['name']}={check['status']} value={check['value']} threshold={check['threshold']}"
        for check in report["checks"]
    )
    return "\n".join(lines)
