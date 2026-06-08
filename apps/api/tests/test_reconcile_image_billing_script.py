from __future__ import annotations

import os
import subprocess
import sys

from sqlalchemy import create_engine, text


def test_reconcile_image_billing_reports_usage_consistency(tmp_path) -> None:
    database_url = f"sqlite:///{tmp_path / 'usage.db'}"
    seed_usage_database(database_url)
    env = {**os.environ, "DATABASE_URL": database_url}

    result = subprocess.run(
        [sys.executable, "scripts/reconcile-image-billing.py", "--job-id", "1", "--json"],
        capture_output=True,
        env=env,
        text=True,
        timeout=60,
    )

    assert result.returncode == 0, result.stderr
    assert '"usage_mismatches": []' in result.stdout
    assert '"local_billing": "removed"' in result.stdout
    assert '"provider_name": "openrouter"' in result.stdout


def test_reconcile_image_billing_accepts_dry_run_modes(tmp_path) -> None:
    database_url = f"sqlite:///{tmp_path / 'usage.db'}"
    seed_usage_database(database_url)
    env = {**os.environ, "DATABASE_URL": database_url}

    for args in ([], ["--dry-run"]):
        result = subprocess.run(
            [sys.executable, "scripts/reconcile-image-billing.py", *args, "--job-id", "1"],
            capture_output=True,
            env=env,
            text=True,
            timeout=60,
        )

        assert result.returncode == 0, result.stderr
        assert "mode=dry-run" in result.stdout


def test_reconcile_image_billing_rejects_execute_mode(tmp_path) -> None:
    database_url = f"sqlite:///{tmp_path / 'usage.db'}"
    seed_usage_database(database_url)
    env = {**os.environ, "DATABASE_URL": database_url}

    result = subprocess.run(
        [sys.executable, "scripts/reconcile-image-billing.py", "--execute", "--job-id", "1"],
        capture_output=True,
        env=env,
        text=True,
        timeout=60,
    )

    assert result.returncode != 0
    assert "audit-only" in result.stderr


def seed_usage_database(database_url: str) -> None:
    engine = create_engine(database_url, future=True)
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE image_jobs (
              id integer primary key,
              status text,
              provider_input_tokens integer,
              provider_output_tokens integer,
              provider_total_tokens integer,
              raw_provider_cost_cents integer,
              provider_fee_cents integer,
              internal_cost_cents integer
            )
        """))
        connection.execute(text("""
            CREATE TABLE image_provider_usage_events (
              id integer primary key,
              job_id integer not null,
              item_id integer,
              provider_id integer,
              provider_name text,
              provider_model text,
              input_tokens integer,
              output_tokens integer,
              total_tokens integer,
              raw_provider_cost_cents integer,
              provider_fee_cents integer,
              internal_cost_cents integer,
              raw_payload text,
              created_at text
            )
        """))
        connection.execute(text("""
            INSERT INTO image_jobs VALUES (1, 'succeeded', 11, 13, 24, 5, 2, 7)
        """))
        connection.execute(text("""
            INSERT INTO image_provider_usage_events VALUES (
              1, 1, 10, 2, 'openrouter', 'openai/gpt-5.4-image-2',
              11, 13, 24, 5, 2, 7, '{"source":"unit"}', CURRENT_TIMESTAMP
            )
        """))
