from __future__ import annotations

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from go_image_api_cutover_collect_lib import validate_cutover_report  # noqa: E402
from go_image_api_cutover_test_helpers import (  # noqa: E402
    create_cutover_test_engine,
    load_check_script_module,
    seed_image_item,
    utc_now_naive,
    valid_cutover_evidence,
)


PARTIAL_READ_DECISION = {
    "phase8_status": "partial",
    "go_image_api_read_default_allowed": True,
    "go_image_api_create_default_allowed": False,
    "next_action": "promote_go_image_api_read_keep_create_gray",
    "failed_checks": ["create_non_go_upstream_count"],
    "unknown_checks": [],
}


def test_decision_allows_read_default_when_only_create_routing_remains_gray() -> None:
    module = load_check_script_module("check_go_image_api_cutover_decision")
    engine = create_cutover_test_engine()
    now = utc_now_naive()
    seed_image_item(engine, status="succeeded", now=now, wait_seconds=10, render_seconds=20)
    evidence = valid_cutover_evidence(module, create_go_upstream_count=1, create_non_go_upstream_count=1)

    report = module.build_report(engine, window_hours=24, evidence=evidence, dead_letter_growth_max=0)

    assert report["passed"] is False
    assert report["cutover_decision"] == PARTIAL_READ_DECISION
    validate_cutover_report(report)


def test_decision_keeps_read_and_create_gated_for_create_5xx_risk() -> None:
    module = load_check_script_module("check_go_image_api_cutover_decision_5xx")
    engine = create_cutover_test_engine()
    now = utc_now_naive()
    seed_image_item(engine, status="succeeded", now=now, wait_seconds=10, render_seconds=20)
    evidence = valid_cutover_evidence(module, create_5xx_rate=0.01)

    report = module.build_report(engine, window_hours=24, evidence=evidence, dead_letter_growth_max=0)

    assert report["passed"] is False
    assert report["cutover_decision"]["phase8_status"] == "blocked"
    assert report["cutover_decision"]["go_image_api_read_default_allowed"] is False
    assert report["cutover_decision"]["go_image_api_create_default_allowed"] is False
    assert report["cutover_decision"]["next_action"] == "keep_go_image_api_gated"
