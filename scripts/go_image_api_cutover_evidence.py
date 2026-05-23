from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import re


CREATE_LOG_RE = re.compile(r'"POST\s+/api/public/image/jobs(?:\?[^ ]*)?\s+HTTP/[0-9.]+"\s+(\d{3})')
CREATE_REQUEST_RE = re.compile(r'"POST\s+/api/public/image/jobs(?:\?[^ ]*)?\s+HTTP/[0-9.]+"')
ROUTE_UPSTREAM_RE = re.compile(r'route_upstream="([^"]+)"')
TIMESTAMP_RE = re.compile(r"\[(\d{2}/[A-Za-z]{3}/\d{4}:\d{2}:\d{2}:\d{2} [+-]\d{4})\]")
HEARTBEAT_METRIC_RE = re.compile(r"^image_worker_heartbeat_failed_total(?:\{[^}]*\})?\s+(\S+)")
MIN_METRIC_COUNT = 0
ASSET_MISSING_RE = re.compile(r"\bmissing=(\d+)\b")
ASSET_MISMATCHED_RE = re.compile(r"\bmismatched=(\d+)\b")
ASSET_CHECKED_RE = re.compile(r"\bchecked=(\d+)\b")
PLACEHOLDER_MARKER_RE = re.compile(r"(?<![A-Za-z0-9])(TODO|TBD|FIXME|synthetic|mock)(?![A-Za-z0-9])", re.IGNORECASE)
GO_IMAGE_API_UPSTREAM = "http://image-api-go:7810"


@dataclass(frozen=True)
class ExternalEvidence:
    create_5xx_rate: float | None
    create_go_upstream_count: int | None
    render_duration_p95_threshold_seconds: float | None
    worker_heartbeat_failed_count: int | None
    asset_missing_count: int | None
    asset_mismatched_count: int | None
    create_non_go_upstream_count: int | None = None
    create_unknown_upstream_count: int | None = None
    rollback_drill_passed: bool | None = None


@dataclass(frozen=True)
class AssetVerifyCounts:
    missing: int | None
    mismatched: int | None


@dataclass(frozen=True)
class CreateRouteCounts:
    go: int | None
    non_go: int | None
    unknown: int | None


def resolve_external_evidence(
    *,
    create_5xx_rate: float | None,
    nginx_access_logs: list[Path],
    create_go_upstream_count: int | None,
    create_non_go_upstream_count: int | None,
    create_unknown_upstream_count: int | None,
    render_duration_p95_threshold_seconds: float | None,
    rollback_drill_passed: bool | None,
    rollback_drill_evidence_file: Path | None,
    worker_heartbeat_failed_count: int | None,
    worker_metrics_file: Path | None,
    asset_missing_count: int | None,
    asset_mismatched_count: int | None,
    asset_verify_output_file: Path | None,
) -> ExternalEvidence:
    asset_counts = asset_counts_from_verify(asset_verify_output_file)
    route_counts = create_route_counts_from_logs(nginx_access_logs)
    return ExternalEvidence(
        create_5xx_rate=create_5xx_rate if create_5xx_rate is not None else create_5xx_rate_from_logs(nginx_access_logs),
        create_go_upstream_count=create_go_upstream_count if create_go_upstream_count is not None else route_counts.go,
        render_duration_p95_threshold_seconds=render_duration_p95_threshold_seconds,
        worker_heartbeat_failed_count=worker_heartbeat_failed_count
        if worker_heartbeat_failed_count is not None
        else heartbeat_failed_count_from_metrics(worker_metrics_file),
        asset_missing_count=asset_missing_count if asset_missing_count is not None else asset_counts.missing,
        asset_mismatched_count=asset_mismatched_count if asset_mismatched_count is not None else asset_counts.mismatched,
        create_non_go_upstream_count=create_non_go_upstream_count
        if create_non_go_upstream_count is not None
        else route_counts.non_go,
        create_unknown_upstream_count=create_unknown_upstream_count
        if create_unknown_upstream_count is not None
        else route_counts.unknown,
        rollback_drill_passed=rollback_drill_passed
        if rollback_drill_passed is not None
        else rollback_drill_passed_from_file(rollback_drill_evidence_file),
    )


def create_5xx_rate_from_logs(paths: list[Path]) -> float | None:
    total = 0
    failures = 0
    for path in paths:
        for line in read_evidence_text(path).splitlines():
            match = CREATE_LOG_RE.search(line)
            if not match:
                reject_malformed_create_log_line(line, path)
                continue
            total += 1
            failures += int(int(match.group(1)) >= 500)
    if total == 0:
        return None
    return round(failures / total, 4)


def create_route_counts_from_logs(paths: list[Path]) -> CreateRouteCounts:
    total = 0
    go_upstream_count = 0
    non_go_count = 0
    unknown_count = 0
    for path in paths:
        for line in read_evidence_text(path).splitlines():
            if not CREATE_LOG_RE.search(line):
                reject_malformed_create_log_line(line, path)
                continue
            total += 1
            upstream = route_upstream_from_create_log_line(line, path)
            if upstream is None:
                unknown_count += 1
            elif upstream == GO_IMAGE_API_UPSTREAM:
                go_upstream_count += 1
            else:
                non_go_count += 1
    if total == 0:
        return CreateRouteCounts(go=None, non_go=None, unknown=None)
    return CreateRouteCounts(go=go_upstream_count, non_go=non_go_count, unknown=unknown_count)


def reject_malformed_create_log_line(line: str, path: Path) -> None:
    if CREATE_REQUEST_RE.search(line):
        raise ValueError(f"invalid nginx create access log line in {path}")


def route_upstream_from_create_log_line(line: str, path: Path) -> str | None:
    upstream_values = ROUTE_UPSTREAM_RE.findall(line)
    if len(upstream_values) > 1:
        raise ValueError(f"invalid nginx create route upstream evidence in {path}")
    return upstream_values[0] if upstream_values else None


def filter_nginx_access_log_text(text_value: str, *, since: datetime) -> str:
    lines: list[str] = []
    for line in text_value.splitlines():
        match = TIMESTAMP_RE.search(line)
        if not match:
            reject_missing_create_timestamp(line)
            continue
        timestamp = parse_nginx_timestamp(match.group(1), line)
        if timestamp is None:
            continue
        if timestamp >= since:
            lines.append(line)
    return "\n".join(lines) + ("\n" if lines else "")


def reject_missing_create_timestamp(line: str) -> None:
    if CREATE_REQUEST_RE.search(line):
        raise ValueError("invalid nginx create access log timestamp")


def parse_nginx_timestamp(value: str, line: str) -> datetime | None:
    try:
        return datetime.strptime(value, "%d/%b/%Y:%H:%M:%S %z")
    except ValueError as exc:
        if CREATE_REQUEST_RE.search(line):
            raise ValueError("invalid nginx create access log timestamp") from exc
        return None


def heartbeat_failed_count_from_metrics(path: Path | None) -> int | None:
    if path is None:
        return None
    total = 0
    matched = False
    for line in read_evidence_text(path).splitlines():
        match = HEARTBEAT_METRIC_RE.match(line.strip())
        if not match:
            continue
        matched = True
        total += parse_integer_metric_value(match.group(1), "heartbeat failed", path)
    if not matched:
        raise ValueError(f"missing heartbeat failed metric in {path}")
    return total


def parse_integer_metric_value(value: str, label: str, path: Path) -> int:
    try:
        numeric_value = float(value)
    except ValueError as exc:
        raise ValueError(f"invalid {label} metric: non-integer value in {path}") from exc
    if not numeric_value.is_integer() or numeric_value < MIN_METRIC_COUNT:
        raise ValueError(f"invalid {label} metric: non-integer value in {path}")
    return int(numeric_value)


def asset_counts_from_verify(path: Path | None) -> AssetVerifyCounts:
    if path is None:
        return AssetVerifyCounts(missing=None, mismatched=None)
    text_value = read_evidence_text(path)
    require_positive_asset_count(ASSET_CHECKED_RE, text_value, "checked", path)
    missing_count = required_asset_count(ASSET_MISSING_RE, text_value, "missing", path)
    mismatched_count = required_asset_count(ASSET_MISMATCHED_RE, text_value, "mismatched", path)
    return AssetVerifyCounts(
        missing=missing_count,
        mismatched=mismatched_count,
    )


def single_asset_count(pattern: re.Pattern[str], text_value: str, label: str, path: Path) -> int | None:
    matches = pattern.findall(text_value)
    if not matches:
        return None
    if len(matches) > 1:
        raise ValueError(f"invalid asset verify evidence: duplicate {label} count in {path}")
    return int(matches[0])


def require_positive_asset_count(pattern: re.Pattern[str], text_value: str, label: str, path: Path) -> None:
    value = single_asset_count(pattern, text_value, label, path)
    if value is None or value <= 0:
        raise ValueError(f"invalid asset verify evidence: {label} count must be positive in {path}")


def required_asset_count(pattern: re.Pattern[str], text_value: str, label: str, path: Path) -> int:
    value = single_asset_count(pattern, text_value, label, path)
    if value is None:
        raise ValueError(f"invalid asset verify evidence: missing {label} count in {path}")
    return value


def rollback_drill_passed_from_file(path: Path | None) -> bool | None:
    if path is None:
        return None
    result: bool | None = None
    for line in read_evidence_text(path).splitlines():
        if line.strip() == "rollback_drill_passed=true":
            result = merge_rollback_drill_result(result, True, path)
        if line.strip() == "rollback_drill_passed=false":
            result = merge_rollback_drill_result(result, False, path)
    if result is None:
        raise ValueError(f"missing rollback drill result: {path}")
    return result


def merge_rollback_drill_result(current: bool | None, value: bool, path: Path) -> bool:
    if current is not None:
        raise ValueError(f"conflicting rollback drill evidence: {path}")
    return value


def read_evidence_text(path: Path) -> str:
    text_value = path.read_text(encoding="utf-8")
    if PLACEHOLDER_MARKER_RE.search(text_value):
        raise ValueError(f"evidence file contains placeholder marker: {path}")
    return text_value
