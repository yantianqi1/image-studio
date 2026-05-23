from __future__ import annotations

from typing import Any


PHASE8_STATUS_COMPLETE = "complete"
PHASE8_STATUS_PARTIAL = "partial"
PHASE8_STATUS_BLOCKED = "blocked"
NEXT_ACTION_PROMOTE_READ_CREATE = "promote_go_image_api_read_create"
NEXT_ACTION_PROMOTE_READ_KEEP_CREATE_GRAY = "promote_go_image_api_read_keep_create_gray"
NEXT_ACTION_KEEP_GATED = "keep_go_image_api_gated"
READ_DEFAULT_ALLOWED_BLOCKING_CHECK_NAMES = frozenset({"create_non_go_upstream_count"})


def build_cutover_decision(passed: bool, checks: list[dict[str, Any]]) -> dict[str, Any]:
    failing = check_names_with_status(checks, "fail")
    unknown = check_names_with_status(checks, "unknown")
    if passed:
        return decision_payload(
            phase8_status=PHASE8_STATUS_COMPLETE,
            read_allowed=True,
            create_allowed=True,
            next_action=NEXT_ACTION_PROMOTE_READ_CREATE,
            failed_checks=failing,
            unknown_checks=unknown,
        )
    if can_promote_read_default(failing, unknown):
        return decision_payload(
            phase8_status=PHASE8_STATUS_PARTIAL,
            read_allowed=True,
            create_allowed=False,
            next_action=NEXT_ACTION_PROMOTE_READ_KEEP_CREATE_GRAY,
            failed_checks=failing,
            unknown_checks=unknown,
        )
    return decision_payload(
        phase8_status=PHASE8_STATUS_BLOCKED,
        read_allowed=False,
        create_allowed=False,
        next_action=NEXT_ACTION_KEEP_GATED,
        failed_checks=failing,
        unknown_checks=unknown,
    )


def can_promote_read_default(failed_checks: list[str], unknown_checks: list[str]) -> bool:
    if unknown_checks or not failed_checks:
        return False
    return set(failed_checks) <= READ_DEFAULT_ALLOWED_BLOCKING_CHECK_NAMES


def decision_payload(
    *,
    phase8_status: str,
    read_allowed: bool,
    create_allowed: bool,
    next_action: str,
    failed_checks: list[str],
    unknown_checks: list[str],
) -> dict[str, Any]:
    return {
        "phase8_status": phase8_status,
        "go_image_api_read_default_allowed": read_allowed,
        "go_image_api_create_default_allowed": create_allowed,
        "next_action": next_action,
        "failed_checks": failed_checks,
        "unknown_checks": unknown_checks,
    }


def check_names_with_status(checks: list[dict[str, Any]], status: str) -> list[str]:
    return [str(check["name"]) for check in checks if check["status"] == status]
