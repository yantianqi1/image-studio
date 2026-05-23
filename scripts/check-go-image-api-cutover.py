#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import sys

from sqlalchemy import create_engine

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from go_image_api_cutover_check_lib import (  # noqa: E402
    EXIT_GATE_FAILED,
    ExternalEvidence,
    MIN_WINDOW_HOURS,
    REQUIRED_CHECK_NAMES,
    ZERO_ALLOWED,
    build_report,
    human_report,
)
from go_image_api_cutover_evidence import resolve_external_evidence  # noqa: E402


REQUIRED_FILE_ARGS = (
    ("nginx_access_log", "--nginx-access-log", "--nginx-access-log is required"),
    ("worker_metrics_file", "--worker-metrics-file", "--worker-metrics-file is required"),
    ("asset_verify_output_file", "--asset-verify-output-file", "--asset-verify-output-file is required"),
    ("rollback_drill_evidence_file", "--rollback-drill-evidence-file", "--rollback-drill-evidence-file is required"),
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Check Go image API Phase 8 cutover gates.")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--window-hours", type=int, default=24)
    parser.add_argument("--rollback-drill-evidence-file")
    parser.add_argument("--nginx-access-log", action="append", default=[])
    parser.add_argument("--render-duration-p95-threshold-seconds", type=float)
    parser.add_argument("--worker-metrics-file")
    parser.add_argument("--asset-verify-output-file")
    parser.add_argument("--dead-letter-growth-max", type=int, default=ZERO_ALLOWED)
    parser.add_argument("--json", action="store_true")
    return parser


def validate_args(args: argparse.Namespace) -> None:
    if not args.database_url:
        raise SystemExit("DATABASE_URL or --database-url is required")
    if args.window_hours < MIN_WINDOW_HOURS:
        raise SystemExit(f"window-hours must be at least {MIN_WINDOW_HOURS}")
    if args.dead_letter_growth_max < ZERO_ALLOWED:
        raise SystemExit("dead-letter-growth-max must be zero or positive")
    if args.render_duration_p95_threshold_seconds is None:
        raise SystemExit("--render-duration-p95-threshold-seconds is required")
    if not math.isfinite(args.render_duration_p95_threshold_seconds) or args.render_duration_p95_threshold_seconds <= 0:
        raise SystemExit("render-duration-p95-threshold-seconds must be positive")
    for attr_name, flag, message in REQUIRED_FILE_ARGS:
        value = getattr(args, attr_name)
        if not value:
            raise SystemExit(message)
        paths = value if isinstance(value, list) else [value]
        for path in paths:
            evidence_path = Path(path)
            if not evidence_path.is_file():
                raise SystemExit(f"evidence file is missing: {flag} {path}")
            if evidence_path.stat().st_size == 0:
                raise SystemExit(f"evidence file is empty: {flag} {path}")


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    validate_args(args)
    evidence = resolve_external_evidence(
        create_5xx_rate=None,
        nginx_access_logs=[Path(path) for path in args.nginx_access_log],
        create_go_upstream_count=None,
        create_non_go_upstream_count=None,
        create_unknown_upstream_count=None,
        rollback_drill_passed=None,
        rollback_drill_evidence_file=Path(args.rollback_drill_evidence_file) if args.rollback_drill_evidence_file else None,
        render_duration_p95_threshold_seconds=args.render_duration_p95_threshold_seconds,
        worker_heartbeat_failed_count=None,
        worker_metrics_file=Path(args.worker_metrics_file) if args.worker_metrics_file else None,
        asset_missing_count=None,
        asset_mismatched_count=None,
        asset_verify_output_file=Path(args.asset_verify_output_file) if args.asset_verify_output_file else None,
    )
    report = build_report(
        create_engine(args.database_url, future=True),
        window_hours=args.window_hours,
        evidence=evidence,
        dead_letter_growth_max=args.dead_letter_growth_max,
    )
    print(json.dumps(report, indent=2, sort_keys=True) if args.json else human_report(report))
    return 0 if report["passed"] else EXIT_GATE_FAILED


if __name__ == "__main__":
    sys.exit(main())
