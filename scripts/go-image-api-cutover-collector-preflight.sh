#!/usr/bin/env bash

validate_collector_inputs() {
  require_integer_at_least WINDOW_HOURS "$WINDOW_HOURS" 24
  require_positive_integer VERIFY_LIMIT "$VERIFY_LIMIT"
  require_non_empty DATABASE_URL "${DATABASE_URL:-}"
  require_non_empty RENDER_DURATION_P95_THRESHOLD_SECONDS "${RENDER_DURATION_P95_THRESHOLD_SECONDS:-}"
  require_positive_number RENDER_DURATION_P95_THRESHOLD_SECONDS "$RENDER_DURATION_P95_THRESHOLD_SECONDS"
  require_non_empty ROLLBACK_DRILL_EVIDENCE_FILE "${ROLLBACK_DRILL_EVIDENCE_FILE:-}"
  require_non_empty_file ROLLBACK_DRILL_EVIDENCE_FILE "$ROLLBACK_DRILL_EVIDENCE_FILE"
  require_no_placeholder_marker ROLLBACK_DRILL_EVIDENCE_FILE "$ROLLBACK_DRILL_EVIDENCE_FILE"
  require_passing_rollback_drill_result ROLLBACK_DRILL_EVIDENCE_FILE "$ROLLBACK_DRILL_EVIDENCE_FILE"
}

require_non_empty() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "$name is required" >&2
    exit 64
  fi
}

require_integer_at_least() {
  local name="$1"
  local value="$2"
  local minimum="$3"
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    echo "$name must be an integer" >&2
    exit 64
  fi
  if (( value < minimum )); then
    echo "$name must be at least $minimum" >&2
    exit 64
  fi
}

require_positive_integer() {
  local name="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[0-9]+$ ]] || (( value <= 0 )); then
    echo "$name must be a positive integer" >&2
    exit 64
  fi
}

require_positive_number() {
  local name="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[0-9]+([.][0-9]+)?$ || "$value" =~ ^0+([.]0+)?$ ]]; then
    echo "$name must be positive" >&2
    exit 64
  fi
}

require_non_empty_file() {
  local name="$1"
  local path="$2"
  if [[ ! -s "$path" ]]; then
    echo "$name must point to a non-empty file" >&2
    exit 69
  fi
}

require_no_placeholder_marker() {
  local name="$1"
  local path="$2"
  if grep -Eiq '(^|[^[:alnum:]])(TODO|TBD|FIXME|synthetic|mock)([^[:alnum:]]|$)' "$path"; then
    echo "$name contains placeholder marker" >&2
    exit 69
  fi
}

require_passing_rollback_drill_result() {
  local name="$1"
  local path="$2"
  local expected_result_count=1
  local zero_allowed=0
  local counts
  local result_count
  local true_count
  local false_count
  counts="$(awk '
    /^[[:space:]]*rollback_drill_passed=(true|false)[[:space:]]*$/ { result += 1 }
    /^[[:space:]]*rollback_drill_passed=true[[:space:]]*$/ { passed += 1 }
    /^[[:space:]]*rollback_drill_passed=false[[:space:]]*$/ { failed += 1 }
    END { printf "%d %d %d\n", result, passed, failed }
  ' "$path")"
  read -r result_count true_count false_count <<< "$counts"
  if (( result_count > expected_result_count )); then
    echo "$name contains multiple rollback_drill_passed results" >&2
    exit 69
  fi
  if (( false_count > zero_allowed )); then
    echo "$name reports rollback_drill_passed=false" >&2
    exit 69
  fi
  if (( true_count != expected_result_count )); then
    echo "$name must include rollback_drill_passed=true" >&2
    exit 69
  fi
}
