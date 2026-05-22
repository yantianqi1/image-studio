#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import os
import random
import statistics
import sys
import time
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any


PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)
SVG_BYTES = b'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>'


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Benchmark image_job_items throughput for the Go image worker.")
    subcommands = parser.add_subparsers(dest="command", required=True)
    add_seed_parser(subcommands)
    add_mock_provider_parser(subcommands)
    add_summary_parser(subcommands)
    return parser


def add_seed_parser(subcommands: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    parser = subcommands.add_parser("seed", help="create benchmark image_jobs and image_job_items")
    parser.add_argument("--jobs", type=positive_int, required=True)
    parser.add_argument("--items-per-job", type=positive_int, required=True)
    parser.add_argument("--owner-count", type=positive_int, required=True)
    parser.add_argument("--provider-id", type=positive_int, required=True)
    parser.add_argument("--model-code", required=True)
    parser.add_argument("--mode", choices=["render-mock"], required=True)
    parser.add_argument("--allow-production", action="store_true")
    parser.set_defaults(func=seed_jobs)


def add_mock_provider_parser(subcommands: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    parser = subcommands.add_parser("mock-provider", help="start an OpenAI chat compatible mock image provider")
    parser.add_argument("--addr", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=17900)
    parser.add_argument("--delay-ms", type=int, default=0)
    parser.add_argument("--fail-rate", type=float, default=0)
    parser.add_argument("--image-format", choices=["png", "svg"], default="png")
    parser.set_defaults(func=run_mock_provider)


def add_summary_parser(subcommands: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    parser = subcommands.add_parser("summary", help="print queue and processing latency summary")
    parser.add_argument("--metrics-url")
    parser.add_argument("--json-output")
    parser.set_defaults(func=print_summary)


def positive_int(raw: str) -> int:
    value = int(raw)
    if value < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    return value


def ensure_non_production(allow_production: bool) -> None:
    if os.environ.get("APP_ENV") == "production" and not allow_production:
        raise SystemExit("refusing to write benchmark data when APP_ENV=production without --allow-production")


def seed_jobs(args: argparse.Namespace) -> None:
    ensure_non_production(args.allow_production)
    engine = create_engine_from_env()
    created_items = 0
    with engine.begin() as connection:
        for job_number in range(args.jobs):
            job_id = insert_job(connection, args, job_number)
            for result_index in range(1, args.items_per_job + 1):
                insert_item(connection, job_id, result_index)
                created_items += 1
    print(f"seeded jobs={args.jobs} items={created_items} mode={args.mode} provider_id={args.provider_id}")


def create_engine_from_env():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required")
    try:
        from sqlalchemy import create_engine
    except ImportError as exc:
        raise SystemExit("sqlalchemy is required for DB benchmark commands") from exc
    return create_engine(database_url, future=True)


def insert_job(connection: Any, args: argparse.Namespace, job_number: int) -> int:
    from sqlalchemy import text

    owner = f"bench-owner-{job_number % args.owner_count}"
    statement = text(
        """
        INSERT INTO image_jobs (
            source, mode, prompt, model_code, provider_id, provider_model,
            client_access_id, status, requested_count, attempt_count, max_attempts,
            visibility, created_at, available_at
        ) VALUES (
            'go-bench', 'generate', :prompt, :model_code, :provider_id, :model_code,
            :owner, 'queued', :requested_count, 0, 3, 'private', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING id
        """
    )
    return int(connection.execute(statement, {
        "prompt": f"benchmark {args.mode} job {job_number}",
        "model_code": args.model_code,
        "provider_id": args.provider_id,
        "owner": owner,
        "requested_count": args.items_per_job,
    }).scalar_one())


def insert_item(connection: Any, job_id: int, result_index: int) -> None:
    from sqlalchemy import text

    connection.execute(text(
        """
        INSERT INTO image_job_items (
            job_id, result_index, status, attempt_count, max_attempts, available_at, created_at
        ) VALUES (:job_id, :result_index, 'queued', 0, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
    ), {"job_id": job_id, "result_index": result_index})


def run_mock_provider(args: argparse.Namespace) -> None:
    handler = make_mock_provider_handler(args.delay_ms, args.fail_rate, args.image_format)
    server = HTTPServer((args.addr, args.port), handler)
    print(f"mock provider listening on http://{args.addr}:{args.port}/v1/chat/completions")
    server.serve_forever()


def make_mock_provider_handler(delay_ms: int, fail_rate: float, image_format: str):
    class MockProviderHandler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            if self.path != "/v1/chat/completions":
                self.send_error(404)
                return
            time.sleep(max(delay_ms, 0) / 1000)
            if random.random() < fail_rate:
                self.send_error(503, "mock provider failure")
                return
            image_path = "/mock-image.svg" if image_format == "svg" else "/mock-image.png"
            image_url = f"http://{self.headers.get('Host')}{image_path}"
            self.send_json({"choices": [{"message": {"content": f"![result]({image_url})"}}]})

        def do_GET(self) -> None:
            if self.path == "/mock-image.png":
                self.send_bytes(PNG_BYTES, "image/png")
                return
            if self.path == "/mock-image.svg":
                self.send_bytes(SVG_BYTES, "image/svg+xml")
                return
            self.send_error(404)

        def send_json(self, payload: dict[str, Any]) -> None:
            self.send_bytes(json.dumps(payload).encode("utf-8"), "application/json")

        def send_bytes(self, content: bytes, content_type: str) -> None:
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        def log_message(self, format: str, *args: Any) -> None:
            return

    return MockProviderHandler


def print_summary(args: argparse.Namespace) -> None:
    summary = collect_summary(args.metrics_url)
    print(json.dumps(summary, indent=2, sort_keys=True))
    if args.json_output:
        path = Path(args.json_output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")


def collect_summary(metrics_url: str | None) -> dict[str, Any]:
    engine = create_engine_from_env()
    with engine.begin() as connection:
        status_counts = fetch_status_counts(connection)
        queue_wait = fetch_durations(connection, "available_at", "started_at")
        processing = fetch_durations(connection, "started_at", "finished_at")
        db_connections = fetch_db_connection_usage(connection)
    summary = {
        "status_counts": status_counts,
        "queue_wait_seconds": summarize_durations(queue_wait),
        "processing_duration_seconds": summarize_durations(processing),
        "db_connections": db_connections,
    }
    if metrics_url:
        summary["metrics_text"] = urllib.request.urlopen(metrics_url, timeout=5).read().decode("utf-8")
    return summary


def fetch_status_counts(connection: Any) -> dict[str, int]:
    from sqlalchemy import text

    rows = connection.execute(text("SELECT status, COUNT(*) FROM image_job_items GROUP BY status")).fetchall()
    return {str(status): int(count) for status, count in rows}


def fetch_db_connection_usage(connection: Any) -> dict[str, int]:
    from sqlalchemy import text

    count = connection.execute(text("SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database()")).scalar_one()
    return {"pg_stat_activity_connections": int(count)}


def fetch_durations(connection: Any, start_column: str, end_column: str) -> list[float]:
    from sqlalchemy import text

    rows = connection.execute(text(
        f"SELECT {start_column}, {end_column} FROM image_job_items WHERE {start_column} IS NOT NULL AND {end_column} IS NOT NULL"
    )).fetchall()
    return [duration_seconds(start, end) for start, end in rows if duration_seconds(start, end) >= 0]


def duration_seconds(start: Any, end: Any) -> float:
    start_dt = parse_datetime(start)
    end_dt = parse_datetime(end)
    return (end_dt - start_dt).total_seconds()


def parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def summarize_durations(values: list[float]) -> dict[str, float]:
    if not values:
        return {"avg": 0, "p50": 0, "p95": 0}
    sorted_values = sorted(values)
    return {
        "avg": statistics.fmean(sorted_values),
        "p50": percentile(sorted_values, 0.50),
        "p95": percentile(sorted_values, 0.95),
    }


def percentile(sorted_values: list[float], rank: float) -> float:
    index = min(len(sorted_values) - 1, int(round((len(sorted_values) - 1) * rank)))
    return sorted_values[index]


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main(sys.argv[1:])
