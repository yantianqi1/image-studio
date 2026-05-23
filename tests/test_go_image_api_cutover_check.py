from __future__ import annotations

import pytest

from go_image_api_cutover_test_helpers import (
    create_cutover_test_engine,
    load_check_script_module,
    seed_image_item,
    seed_outbox_event,
    utc_now_naive,
    valid_cutover_evidence,
)


def test_cutover_gate_passes_with_db_and_external_evidence() -> None:
    module = load_check_script_module("check_go_image_api_cutover")
    engine = create_cutover_test_engine()
    now = utc_now_naive()
    seed_image_item(engine, status="succeeded", now=now, wait_seconds=10, render_seconds=20)
    seed_image_item(engine, status="succeeded", now=now, wait_seconds=20, render_seconds=30)
    evidence = valid_cutover_evidence(module, create_5xx_rate=0.001, create_go_upstream_count=2)

    report = module.build_report(engine, window_hours=24, evidence=evidence, dead_letter_growth_max=0)

    assert report["passed"] is True
    assert report["cutover_decision"] == {
        "phase8_status": "complete",
        "go_image_api_read_default_allowed": True,
        "go_image_api_create_default_allowed": True,
        "next_action": "promote_go_image_api_read_create",
        "failed_checks": [],
        "unknown_checks": [],
    }
    assert {check["status"] for check in report["checks"]} == {"pass"}


def test_cutover_gate_rejects_windows_shorter_than_24_hours() -> None:
    module = load_check_script_module("check_go_image_api_cutover")
    engine = create_cutover_test_engine()
    evidence = valid_cutover_evidence(module)

    with pytest.raises(ValueError, match="window_hours must be at least 24"):
        module.build_report(engine, window_hours=23, evidence=evidence, dead_letter_growth_max=0)


def test_cutover_gate_rejects_negative_dead_letter_growth_max() -> None:
    module = load_check_script_module("check_go_image_api_cutover")
    engine = create_cutover_test_engine()
    evidence = valid_cutover_evidence(module)

    with pytest.raises(ValueError, match="dead_letter_growth_max must be zero or positive"):
        module.build_report(engine, window_hours=24, evidence=evidence, dead_letter_growth_max=-1)


def test_cutover_gate_fails_when_required_external_evidence_is_missing() -> None:
    module = load_check_script_module("check_go_image_api_cutover")
    engine = create_cutover_test_engine()
    now = utc_now_naive()
    seed_image_item(engine, status="succeeded", now=now, wait_seconds=10, render_seconds=20)
    evidence = valid_cutover_evidence(
        module,
        create_5xx_rate=None,
        create_go_upstream_count=None,
        create_non_go_upstream_count=None,
        create_unknown_upstream_count=None,
        worker_heartbeat_failed_count=None,
        asset_missing_count=None,
        asset_mismatched_count=None,
        rollback_drill_passed=None,
    )

    report = module.build_report(engine, window_hours=24, evidence=evidence, dead_letter_growth_max=0)

    unknown_checks = [check["name"] for check in report["checks"] if check["status"] == "unknown"]
    assert report["passed"] is False
    assert report["cutover_decision"]["unknown_checks"] == unknown_checks
    assert report["cutover_decision"]["failed_checks"] == []
    assert unknown_checks == [
        "create_5xx_rate",
        "create_go_upstream_count",
        "create_non_go_upstream_count",
        "create_unknown_upstream_count",
        "worker_heartbeat_failed_count",
        "asset_missing_count",
        "asset_mismatched_count",
        "rollback_drill_passed",
    ]


def test_cutover_gate_fails_when_rollback_drill_did_not_pass() -> None:
    module = load_check_script_module("check_go_image_api_cutover")
    engine = create_cutover_test_engine()
    now = utc_now_naive()
    seed_image_item(engine, status="succeeded", now=now, wait_seconds=10, render_seconds=20)
    evidence = valid_cutover_evidence(module, rollback_drill_passed=False)

    report = module.build_report(engine, window_hours=24, evidence=evidence, dead_letter_growth_max=0)

    failed_checks = {check["name"] for check in report["checks"] if check["status"] == "fail"}
    assert report["passed"] is False
    assert "rollback_drill_passed" in failed_checks


def test_cutover_gate_fails_when_window_has_no_items() -> None:
    module = load_check_script_module("check_go_image_api_cutover")
    engine = create_cutover_test_engine()
    evidence = valid_cutover_evidence(module)

    report = module.build_report(engine, window_hours=24, evidence=evidence, dead_letter_growth_max=0)

    failed_checks = {check["name"] for check in report["checks"] if check["status"] == "fail"}
    assert report["passed"] is False
    assert report["cutover_decision"] == {
        "phase8_status": "blocked",
        "go_image_api_read_default_allowed": False,
        "go_image_api_create_default_allowed": False,
        "next_action": "keep_go_image_api_gated",
        "failed_checks": ["items_in_window"],
        "unknown_checks": [
            "item_terminal_failure_rate",
            "provider_failure_rate",
            "queue_wait_p95_seconds",
            "render_duration_p95_seconds",
        ],
    }
    assert "items_in_window" in failed_checks


def test_cutover_gate_fails_when_db_thresholds_are_exceeded() -> None:
    module = load_check_script_module("check_go_image_api_cutover")
    engine = create_cutover_test_engine()
    now = utc_now_naive()
    seed_image_item(engine, status="failed", now=now, wait_seconds=130, render_seconds=200, dead_letter=True)
    seed_outbox_event(engine, now=now, oldest_age_seconds=90)
    evidence = valid_cutover_evidence(module, render_duration_p95_threshold_seconds=100)

    report = module.build_report(engine, window_hours=24, evidence=evidence, dead_letter_growth_max=0)

    failed_checks = {check["name"] for check in report["checks"] if check["status"] == "fail"}
    assert report["passed"] is False
    assert {
        "item_terminal_failure_rate",
        "queue_wait_p95_seconds",
        "render_duration_p95_seconds",
        "outbox_pending_oldest_age_seconds",
        "dead_letter_growth",
    } <= failed_checks


def test_cutover_gate_fails_at_exclusive_threshold_boundaries() -> None:
    module = load_check_script_module("check_go_image_api_cutover")
    engine = create_cutover_test_engine()
    now = utc_now_naive()
    for index in range(100):
        seed_image_item(
            engine,
            status="failed" if index < 3 else "succeeded",
            now=now,
            wait_seconds=120,
            render_seconds=20,
            last_error_code="provider_request_failed" if index < 3 else None,
        )
    evidence = valid_cutover_evidence(module, create_5xx_rate=0.005)

    report = module.build_report(engine, window_hours=24, evidence=evidence, dead_letter_growth_max=0)

    failed_checks = {check["name"] for check in report["checks"] if check["status"] == "fail"}
    assert report["passed"] is False
    assert {
        "create_5xx_rate",
        "item_terminal_failure_rate",
        "provider_failure_rate",
        "queue_wait_p95_seconds",
    } <= failed_checks


def test_cutover_gate_fails_when_provider_failure_rate_is_exceeded() -> None:
    module = load_check_script_module("check_go_image_api_cutover")
    engine = create_cutover_test_engine()
    now = utc_now_naive()
    seed_image_item(engine, status="succeeded", now=now, wait_seconds=10, render_seconds=20)
    seed_image_item(
        engine,
        status="queued",
        now=now,
        wait_seconds=10,
        render_seconds=20,
        last_error_code="provider_request_failed",
    )
    evidence = valid_cutover_evidence(module)

    report = module.build_report(engine, window_hours=24, evidence=evidence, dead_letter_growth_max=0)

    failed_checks = {check["name"] for check in report["checks"] if check["status"] == "fail"}
    assert report["passed"] is False
    assert "provider_failure_rate" in failed_checks


def test_cutover_gate_fails_when_item_timestamps_are_invalid() -> None:
    module = load_check_script_module("check_go_image_api_cutover")
    engine = create_cutover_test_engine()
    now = utc_now_naive()
    seed_image_item(engine, status="succeeded", now=now, wait_seconds=-1, render_seconds=-1)
    evidence = valid_cutover_evidence(module)

    report = module.build_report(engine, window_hours=24, evidence=evidence, dead_letter_growth_max=0)

    failed_checks = {check["name"] for check in report["checks"] if check["status"] == "fail"}
    assert report["passed"] is False
    assert {
        "invalid_queue_timestamp_count",
        "invalid_render_timestamp_count",
    } <= failed_checks
