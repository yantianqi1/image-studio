#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

from sqlalchemy import create_engine, inspect, text


USAGE_FIELDS = (
    "provider_input_tokens",
    "provider_output_tokens",
    "provider_total_tokens",
    "raw_provider_cost_cents",
    "provider_fee_cents",
    "internal_cost_cents",
)

EVENT_FIELD_MAP = {
    "provider_input_tokens": "input_tokens",
    "provider_output_tokens": "output_tokens",
    "provider_total_tokens": "total_tokens",
    "raw_provider_cost_cents": "raw_provider_cost_cents",
    "provider_fee_cents": "provider_fee_cents",
    "internal_cost_cents": "internal_cost_cents",
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Reconcile image provider usage audit data.")
    parser.add_argument("--dry-run", action="store_true", help="audit only; this is the default")
    parser.add_argument("--execute", action="store_true", help="unsupported; this script does not mutate data")
    parser.add_argument("--job-id", type=int)
    parser.add_argument("--json", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.execute:
        raise SystemExit("--execute is not supported; reconcile-image-billing.py is audit-only")
    engine = create_engine_from_env()
    report = build_report(engine, job_id=args.job_id)
    output = json.dumps(report, indent=2, sort_keys=True) if args.json else human_report(report)
    print(output)
    return 1 if report["usage_mismatches"] else 0


def create_engine_from_env():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required")
    return create_engine(database_url, future=True)


def build_report(engine, *, job_id: int | None, mode: str = "dry-run") -> dict[str, Any]:
    with engine.begin() as connection:
        rows = fetch_usage_rows(connection, job_id=job_id)
        stats = fetch_provider_stats(connection, job_id=job_id)
    mismatches = [issue for row in rows for issue in row_mismatches(row)]
    return {
        "job_id": job_id,
        "mode": mode,
        "local_billing": local_billing_status(engine),
        "usage_mismatches": mismatches,
        "provider_model_stats": stats,
    }


def fetch_usage_rows(connection, *, job_id: int | None) -> list[dict[str, Any]]:
    statement = text("""
        SELECT
          j.id AS job_id,
          j.provider_input_tokens, j.provider_output_tokens, j.provider_total_tokens,
          j.raw_provider_cost_cents, j.provider_fee_cents, j.internal_cost_cents,
          SUM(e.input_tokens) AS event_input_tokens,
          SUM(e.output_tokens) AS event_output_tokens,
          SUM(e.total_tokens) AS event_total_tokens,
          SUM(e.raw_provider_cost_cents) AS event_raw_provider_cost_cents,
          SUM(e.provider_fee_cents) AS event_provider_fee_cents,
          SUM(e.internal_cost_cents) AS event_internal_cost_cents
        FROM image_jobs j
        LEFT JOIN image_provider_usage_events e ON e.job_id = j.id
        WHERE (:job_id IS NULL OR j.id = :job_id)
        GROUP BY j.id
    """)
    return [dict(row._mapping) for row in connection.execute(statement, {"job_id": job_id})]


def fetch_provider_stats(connection, *, job_id: int | None) -> list[dict[str, Any]]:
    statement = text("""
        SELECT
          provider_name,
          provider_model,
          COUNT(*) AS event_count,
          SUM(input_tokens) AS input_tokens,
          SUM(output_tokens) AS output_tokens,
          SUM(total_tokens) AS total_tokens,
          SUM(raw_provider_cost_cents) AS raw_provider_cost_cents,
          SUM(provider_fee_cents) AS provider_fee_cents,
          SUM(internal_cost_cents) AS internal_cost_cents
        FROM image_provider_usage_events
        WHERE (:job_id IS NULL OR job_id = :job_id)
        GROUP BY provider_name, provider_model
        ORDER BY internal_cost_cents DESC
    """)
    return [dict(row._mapping) for row in connection.execute(statement, {"job_id": job_id})]


def row_mismatches(row: dict[str, Any]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    for job_field, event_field in EVENT_FIELD_MAP.items():
        job_value = row.get(job_field)
        event_value = row.get(f"event_{event_field}")
        if nullable_int(job_value) != nullable_int(event_value):
            issues.append({
                "job_id": row["job_id"],
                "field": job_field,
                "job_value": job_value,
                "event_sum": event_value,
            })
    return issues


def nullable_int(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


def local_billing_status(engine) -> str:
    inspector = inspect(engine)
    image_columns = {column["name"] for column in inspector.get_columns("image_jobs")}
    wallet_tables = {"wallets", "wallet_ledger", "wallet_reservations"}
    if wallet_tables.isdisjoint(inspector.get_table_names()) and "charge_cents" not in image_columns:
        return "removed"
    return "present"


def human_report(report: dict[str, Any]) -> str:
    lines = [
        f"mode={report['mode']}",
        f"local_billing={report['local_billing']}",
        f"usage_mismatches={len(report['usage_mismatches'])}",
        f"provider_model_stats={len(report['provider_model_stats'])}",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    sys.exit(main())
