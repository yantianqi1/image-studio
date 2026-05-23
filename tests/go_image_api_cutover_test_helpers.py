from __future__ import annotations

from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
import sys

from sqlalchemy import create_engine, text


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts/check-go-image-api-cutover.py"


def utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def load_check_script_module(module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def create_cutover_test_engine():
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE image_job_items (
              status TEXT NOT NULL,
              available_at DATETIME NOT NULL,
              started_at DATETIME,
              finished_at DATETIME,
              dead_letter_at DATETIME,
              error_code TEXT,
              last_error_code TEXT,
              created_at DATETIME NOT NULL
            )
        """))
        connection.execute(text("""
            CREATE TABLE outbox_events (
              status TEXT NOT NULL,
              available_at DATETIME NOT NULL
            )
        """))
    return engine


def valid_cutover_evidence(module, **overrides):
    values = {
        "create_5xx_rate": 0.0,
        "create_go_upstream_count": 1,
        "create_non_go_upstream_count": 0,
        "create_unknown_upstream_count": 0,
        "render_duration_p95_threshold_seconds": 60,
        "worker_heartbeat_failed_count": 0,
        "asset_missing_count": 0,
        "asset_mismatched_count": 0,
        "rollback_drill_passed": True,
    }
    values.update(overrides)
    return module.ExternalEvidence(**values)


def seed_image_item(
    engine,
    *,
    status: str = "succeeded",
    now: datetime,
    wait_seconds: int = 10,
    render_seconds: int = 20,
    dead_letter: bool = False,
    error_code: str | None = None,
    last_error_code: str | None = None,
) -> None:
    available_at = now - timedelta(minutes=5)
    started_at = available_at + timedelta(seconds=wait_seconds)
    finished_at = started_at + timedelta(seconds=render_seconds)
    dead_letter_at = finished_at if dead_letter else None
    with engine.begin() as connection:
        connection.execute(
            text("""
                INSERT INTO image_job_items (
                  status, available_at, started_at, finished_at, dead_letter_at,
                  error_code, last_error_code, created_at
                ) VALUES (
                  :status, :available_at, :started_at, :finished_at, :dead_letter_at,
                  :error_code, :last_error_code, :created_at
                )
            """),
            {
                "status": status,
                "available_at": available_at,
                "started_at": started_at,
                "finished_at": finished_at,
                "dead_letter_at": dead_letter_at,
                "error_code": error_code,
                "last_error_code": last_error_code,
                "created_at": available_at,
            },
        )


def seed_outbox_event(engine, *, now: datetime, oldest_age_seconds: int) -> None:
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO outbox_events (status, available_at) VALUES ('pending', :available_at)"),
            {"available_at": now - timedelta(seconds=oldest_age_seconds)},
        )
