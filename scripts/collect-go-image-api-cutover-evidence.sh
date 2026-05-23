#!/usr/bin/env bash
set -euo pipefail

WINDOW_HOURS="${WINDOW_HOURS:-24}"
VERIFY_LIMIT="${VERIFY_LIMIT:-1000}"
EVIDENCE_DIR="${EVIDENCE_DIR:-cutover-evidence/$(date -u +%Y%m%dT%H%M%SZ)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/go-image-api-cutover-collector-preflight.sh"

validate_collector_inputs

mkdir -p "$EVIDENCE_DIR"
PREFLIGHT_REPORT="$EVIDENCE_DIR/preflight.txt"
ROLLBACK_DRILL="$EVIDENCE_DIR/rollback-drill.txt"
cp "$ROLLBACK_DRILL_EVIDENCE_FILE" "$ROLLBACK_DRILL"

required_services=(image-api-go worker-go postgres nginx)
running_services="$(docker compose ps --status running --services)"
{
  echo "window_hours=$WINDOW_HOURS"
  echo "verify_limit=$VERIFY_LIMIT"
  echo "render_duration_p95_threshold_seconds=$RENDER_DURATION_P95_THRESHOLD_SECONDS"
  echo "services_running:"
  printf '%s\n' "$running_services"
} > "$PREFLIGHT_REPORT"

for service in "${required_services[@]}"; do
  if ! grep -qx "$service" <<< "$running_services"; then
    echo "missing_service=$service" >> "$PREFLIGHT_REPORT"
    echo "required service is not running: $service" >&2
    exit 69
  fi
done

REQUIRED_ENV_VALUE=""

require_env_present() {
  local service="$1"
  local key="$2"
  local value
  if ! value="$(docker compose exec -T "$service" printenv "$key")"; then
    echo "missing_env=$service.$key" >> "$PREFLIGHT_REPORT"
    echo "required env is not set: $service.$key" >&2
    exit 69
  fi
  if [[ -z "$value" ]]; then
    echo "empty_env=$service.$key" >> "$PREFLIGHT_REPORT"
    echo "required env is empty: $service.$key" >&2
    exit 69
  fi
  REQUIRED_ENV_VALUE="$value"
  echo "$service.$key=$value" >> "$PREFLIGHT_REPORT"
}

require_env_equals() {
  local service="$1"
  local key="$2"
  local expected="$3"
  require_env_present "$service" "$key"
  if [[ "$REQUIRED_ENV_VALUE" != "$expected" ]]; then
    echo "mismatched_env=$service.$key expected=$expected actual=$REQUIRED_ENV_VALUE" >> "$PREFLIGHT_REPORT"
    echo "required env mismatch: $service.$key=$REQUIRED_ENV_VALUE expected=$expected" >&2
    exit 69
  fi
}

require_http_ok() {
  local service="$1"
  local url="$2"
  local label="$3"
  if ! docker compose exec -T "$service" wget -qO- "$url" >/dev/null; then
    echo "unhealthy_endpoint=$service.$label url=$url" >> "$PREFLIGHT_REPORT"
    echo "required endpoint is not healthy: $service.$label $url" >&2
    exit 69
  fi
  echo "$service.$label=ok" >> "$PREFLIGHT_REPORT"
}

required_worker_mode="render"
require_env_equals worker-go GO_WORKER_MODE "$required_worker_mode"

required_route_flags=(
  GO_IMAGE_API_READS_ENABLED
  GO_IMAGE_API_ASSETS_ENABLED
  GO_IMAGE_API_SSE_ENABLED
  GO_IMAGE_API_CREATE_ENABLED
)
for flag in "${required_route_flags[@]}"; do
  require_env_equals nginx "$flag" "true"
done

required_image_api_flags=(GO_IMAGE_API_CREATE_ENABLED)
for flag in "${required_image_api_flags[@]}"; do
  require_env_equals image-api-go "$flag" "true"
done

require_env_present worker-go ASSET_STORAGE_BACKEND
case "$REQUIRED_ENV_VALUE" in
  local)
    require_env_present worker-go GENERATED_ASSETS_DIR
    ;;
  gcs)
    require_env_present worker-go ASSET_STORAGE_GCS_BUCKET
    ;;
  *)
    echo "unsupported_asset_storage_backend=$REQUIRED_ENV_VALUE" >> "$PREFLIGHT_REPORT"
    echo "unsupported asset storage backend for cutover evidence: $REQUIRED_ENV_VALUE" >&2
    exit 69
    ;;
esac

require_http_ok image-api-go http://127.0.0.1:7810/readyz readyz
require_http_ok worker-go http://127.0.0.1:7900/readyz readyz

RAW_NGINX_LOG="$EVIDENCE_DIR/nginx-access.raw.log"
NGINX_LOG="$EVIDENCE_DIR/nginx-access.log"
WORKER_METRICS="$EVIDENCE_DIR/worker-go.metrics"
ASSET_VERIFY="$EVIDENCE_DIR/assetctl-verify-assets.out"
REPORT_JSON="$EVIDENCE_DIR/go-image-api-cutover-report.json"
MANIFEST_JSON="$EVIDENCE_DIR/manifest.json"

write_manifest() {
  export ASSET_VERIFY CHECK_EXIT EVIDENCE_DIR MANIFEST_JSON NGINX_LOG PREFLIGHT_REPORT RAW_NGINX_LOG REPORT_JSON ROLLBACK_DRILL
  export RENDER_DURATION_P95_THRESHOLD_SECONDS SCRIPT_DIR VERIFY_LIMIT WINDOW_HOURS WORKER_METRICS
  python3 - <<'PY'
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, os.environ["SCRIPT_DIR"])
from go_image_api_cutover_collect_lib import manifest_cutover_decision, validate_cutover_manifest


def artifact(name: str, env_key: str) -> dict[str, object]:
    path = Path(os.environ[env_key])
    payload = path.read_bytes()
    return {
        "name": name,
        "path": path.name,
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }


manifest = {
    "generated_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "window_hours": int(os.environ["WINDOW_HOURS"]),
    "verify_limit": int(os.environ["VERIFY_LIMIT"]),
    "render_duration_p95_threshold_seconds": float(os.environ["RENDER_DURATION_P95_THRESHOLD_SECONDS"]),
    "checker_exit_code": int(os.environ["CHECK_EXIT"]),
    "cutover_decision": manifest_cutover_decision(
        Path(os.environ["REPORT_JSON"]),
        checker_exit_code=int(os.environ["CHECK_EXIT"]),
    ),
    "artifacts": [
        artifact("preflight", "PREFLIGHT_REPORT"),
        artifact("raw_nginx_access_log", "RAW_NGINX_LOG"),
        artifact("nginx_access_log", "NGINX_LOG"),
        artifact("worker_metrics", "WORKER_METRICS"),
        artifact("asset_verify", "ASSET_VERIFY"),
        artifact("rollback_drill", "ROLLBACK_DRILL"),
        artifact("cutover_report", "REPORT_JSON"),
    ],
}
validate_cutover_manifest(manifest)
Path(os.environ["MANIFEST_JSON"]).write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
PY
}

filter_nginx_access_log() {
  export NGINX_LOG RAW_NGINX_LOG SCRIPT_DIR WINDOW_HOURS
  python3 - <<'PY'
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import sys

sys.path.insert(0, os.environ["SCRIPT_DIR"])
from go_image_api_cutover_evidence import filter_nginx_access_log_text

since = datetime.now(timezone.utc) - timedelta(hours=int(os.environ["WINDOW_HOURS"]))
raw_path = Path(os.environ["RAW_NGINX_LOG"])
filtered_path = Path(os.environ["NGINX_LOG"])
try:
    filtered_text = filter_nginx_access_log_text(raw_path.read_text(encoding="utf-8"), since=since)
except ValueError as exc:
    print(str(exc), file=sys.stderr)
    sys.exit(69)
filtered_path.write_text(filtered_text, encoding="utf-8")
PY
}

validate_cutover_report() {
  if [[ ! -s "$REPORT_JSON" ]]; then
    echo "empty cutover report: $REPORT_JSON" >&2
    exit 69
  fi
  export REPORT_JSON SCRIPT_DIR
  python3 - <<'PY'
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, os.environ["SCRIPT_DIR"])
from go_image_api_cutover_collect_lib import CutoverReportValidationError, validate_cutover_report_file

try:
    validate_cutover_report_file(Path(os.environ["REPORT_JSON"]))
except CutoverReportValidationError as exc:
    print(f"invalid cutover report JSON: {exc}", file=sys.stderr)
    sys.exit(69)
PY
}

docker compose exec -T nginx cat /var/log/nginx/access.log > "$RAW_NGINX_LOG"
filter_nginx_access_log
docker compose exec -T worker-go wget -qO- http://127.0.0.1:7900/metrics > "$WORKER_METRICS"

docker compose exec -T worker-go /app/assetctl verify-assets --limit "$VERIFY_LIMIT" > "$ASSET_VERIFY"

set +e
python3 scripts/check-go-image-api-cutover.py \
  --database-url "$DATABASE_URL" \
  --window-hours "$WINDOW_HOURS" \
  --nginx-access-log "$NGINX_LOG" \
  --render-duration-p95-threshold-seconds "$RENDER_DURATION_P95_THRESHOLD_SECONDS" \
  --worker-metrics-file "$WORKER_METRICS" \
  --asset-verify-output-file "$ASSET_VERIFY" \
  --rollback-drill-evidence-file "$ROLLBACK_DRILL" \
  --json > "$REPORT_JSON"
CHECK_EXIT=$?
set -e

validate_cutover_report
write_manifest

if [[ "$CHECK_EXIT" -ne 0 ]]; then
  echo "cutover checker failed with exit code $CHECK_EXIT" >&2
fi

echo "cutover evidence written to $EVIDENCE_DIR"
echo "report: $REPORT_JSON"
echo "manifest: $MANIFEST_JSON"
exit "$CHECK_EXIT"
