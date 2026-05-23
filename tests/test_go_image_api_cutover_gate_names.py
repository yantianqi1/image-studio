from __future__ import annotations

from go_image_api_cutover_test_helpers import (
    create_cutover_test_engine,
    load_check_script_module,
    seed_image_item,
    utc_now_naive,
    valid_cutover_evidence,
)


def test_required_check_names_match_report_order() -> None:
    module = load_check_script_module("check_go_image_api_cutover_gate_names")
    engine = create_cutover_test_engine()
    now = utc_now_naive()
    seed_image_item(engine, now=now)
    evidence = valid_cutover_evidence(module)

    report = module.build_report(engine, window_hours=24, evidence=evidence, dead_letter_growth_max=0)

    assert [check["name"] for check in report["checks"]] == list(module.REQUIRED_CHECK_NAMES)
