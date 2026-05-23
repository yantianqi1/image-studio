# Go Image API Cutover

This runbook defines the production gate for moving Go image API create/read to
full traffic. It does not remove FastAPI fallback. Every rollback uses explicit
`GO_IMAGE_API_*_ENABLED=false` flags plus an nginx reload.

## Cutover Gate

Use a rolling 24 hour window before enabling full traffic:
`scripts/check-go-image-api-cutover.py` rejects shorter windows, so local dev
smoke runs cannot be promoted as cutover evidence.

| Gate | Threshold | Current evidence |
| --- | --- | --- |
| traffic sample | at least 1 image item in the observation window | `scripts/check-go-image-api-cutover.py` reads `image_job_items` |
| create 5xx rate | create 5xx rate < 0.5% | `scripts/collect-go-image-api-cutover-evidence.sh` parses nginx logs |
| create route proof | every create request is routed to Go image API | nginx access logs must include `route_upstream="http://image-api-go:7810"` for every `POST /api/public/image/jobs`; non-Go or missing route evidence blocks promotion |
| item failures | image item terminal failure rate < 3% | `image_worker_item_failed_total`, `image_worker_item_succeeded_total`, DB item status counts |
| provider failures | provider failure rate < 3% | `scripts/check-go-image-api-cutover.py` reads provider error codes from `image_job_items` |
| timestamp integrity | invalid queue/render timestamp count = 0 | `scripts/check-go-image-api-cutover.py` normalizes timezone-aware DB timestamps to UTC and rejects negative queue waits or render durations |
| queue wait | queue wait p95 < 120s | `image_worker_queue_wait_seconds` histogram or admin stats panel |
| render duration | render duration p95 within normal provider range | `image_worker_render_duration_seconds` histogram or admin stats panel |
| outbox lag | outbox pending oldest age < 60s | `scripts/check-go-image-api-cutover.py` reads pending `outbox_events` |
| dead letters | dead letter count has no abnormal growth | admin queue summary, admin dead-letter list |
| worker health | worker heartbeat failed has no consecutive alerts | `image_worker_heartbeat_failed_total`, worker logs |
| asset integrity | asset missing count = 0 and asset mismatched count = 0 | `scripts/collect-go-image-api-cutover-evidence.sh` parses `assetctl verify-assets` output |

Do not promote if any threshold is unknown and the missing evidence touches the
traffic path being enabled.
Evidence artifacts must be real target-environment output. Files containing
placeholder markers such as `TODO`, `TBD`, `FIXME`, `synthetic`, `mock`,
`synthetic_success`, or `mock_pass` are invalid and must be regenerated instead
of parsed as passing evidence.

## Dashboard Coverage

Admin Image Jobs already exposes available cutover signals:

- queue wait p95 as `队列 p95`
- render duration p95 as `渲染 p95`
- dead letter count as `死信单元`
- provider circuit count as `供应商熔断`
- worker queue counts, stale running items, worker drain/resume controls

Missing dashboard/backend metrics must remain explicit TODOs. Do not display
synthetic zeroes for create 5xx rate or asset missing count.

## Executable Gate Check

Preferred production evidence collection:

```bash
DATABASE_URL="$DATABASE_URL" \
ROLLBACK_DRILL_EVIDENCE_FILE=/path/to/rollback-drill.txt \
RENDER_DURATION_P95_THRESHOLD_SECONDS=180 \
scripts/collect-go-image-api-cutover-evidence.sh
```

`WINDOW_HOURS` defaults to `24`; non-integer values and values below `24` fail
before the collector touches Docker, creates an evidence bundle, or reads
target-environment artifacts. `VERIFY_LIMIT` must be a positive integer, and
`RENDER_DURATION_P95_THRESHOLD_SECONDS` must be a positive number, with the same
early-fail behavior. `ROLLBACK_DRILL_EVIDENCE_FILE` must point to a non-empty
file before the evidence directory is created, and placeholder markers in that
file fail before the collector touches Docker. It must contain exactly one
passing rollback result line, `rollback_drill_passed=true`; missing, false, or
multiple rollback result lines fail before the evidence directory is created.

The collector writes an evidence directory containing:

- `manifest.json` with the window settings, checker exit code, and 64-character
  hex sha256 for each evidence artifact, plus the validated
  `cutover_decision`. Manifest generation rejects missing, duplicate,
  unexpected, zero-byte, path-drift, or malformed-hash artifacts before writing
  the evidence bundle index. It also validates the top-level manifest window,
  UTC generation timestamp, verify limit, render p95 threshold, and checker
  exit code before writing. The copied `cutover_decision` must be complete and
  must match the checker exit code, so a success manifest cannot preserve a
  blocked decision and a gate-failed manifest must list non-duplicated blocking
  checks from the canonical cutover gate list. A gate cannot appear in both
  `failed_checks` and `unknown_checks`, and each list must keep canonical gate
  order.
- `preflight.txt` with the target service, route flag, worker mode, and asset
  storage checks
- raw nginx access logs from the running container's
  `/var/log/nginx/access.log`
- nginx access logs filtered to the observation window
- worker-go Prometheus metrics
- `/app/assetctl verify-assets` output from the running `worker-go` container
- `rollback-drill.txt`, copied from `ROLLBACK_DRILL_EVIDENCE_FILE`, with the
  controlled rollback drill notes and `rollback_drill_passed=true`
- the JSON output from `scripts/check-go-image-api-cutover.py`, including the
  machine-readable `cutover_decision`

If the checker produces a gate-failed JSON report, the collector still writes
`manifest.json` and then exits with the checker exit code. Earlier preflight or
artifact collection failures still fail immediately. Empty, invalid, or
schema-incomplete checker reports, including reports missing `cutover_decision`,
fail before `manifest.json` is written. Reports with an empty `checks` array are
also invalid. `cutover_decision` must include the phase status, read default
permission, create default permission, and next action, and those values must
match the report's `passed` value. It also carries `failed_checks` and
`unknown_checks` so a blocked report exposes the exact gate names that prevent
promotion. Those lists must match the report's actual `checks` entries with
`status=fail` and `status=unknown`; contradictory decision summaries are
rejected before `manifest.json` is written. Every `checks` entry must have a
non-empty name, a `pass`, `fail`, or `unknown` status, and typed `value` and
`threshold` evidence fields. Missing evidence fields or placeholder strings in
check values are invalid even when the check claims `status=pass`; numeric
values must also be finite, so `NaN` and `Infinity` are invalid. A `pass` or
`fail` check cannot have null evidence values, while an `unknown` check must
have a null value or threshold to prove why the gate is unknown. Numeric gates
must use numeric `value` and `threshold` evidence; only `rollback_drill_passed`
uses boolean evidence. The
top-level `passed` value must match the absence or presence of blocking checks.
The report must include every required cutover gate exactly once; missing or
duplicate gate names are invalid. Extra gate names and gate-order drift are also
invalid, because collector validation must match the checker-owned canonical
gate list exactly. The same validated decision is copied to `manifest.json` so
the evidence bundle can be inspected without opening the full checker report.

Before writing evidence, the collector fails fast unless `image-api-go`,
`worker-go`, `postgres`, and `nginx` are running in the target compose
environment. It also requires `worker-go` to run with `GO_WORKER_MODE=render`,
the nginx `GO_IMAGE_API_READS_ENABLED`, `GO_IMAGE_API_ASSETS_ENABLED`,
`GO_IMAGE_API_SSE_ENABLED`, and `GO_IMAGE_API_CREATE_ENABLED` flags to be
`true`, `image-api-go` to run with `GO_IMAGE_API_CREATE_ENABLED=true`, and
asset storage to be explicitly configured. The same preflight also checks
`image-api-go` and `worker-go` `/readyz` from inside their running containers.
It also requires a non-empty `ROLLBACK_DRILL_EVIDENCE_FILE`, copies it into the
evidence directory, and passes it to the checker.

Use `scripts/check-go-image-api-cutover.py` after the 24 hour observation window
to evaluate DB-backed gates and required external evidence in one command:

```bash
DATABASE_URL="$DATABASE_URL" python3 scripts/check-go-image-api-cutover.py \
  --window-hours 24 \
  --nginx-access-log /var/log/nginx/access.log \
  --render-duration-p95-threshold-seconds 180 \
  --worker-metrics-file worker-go.metrics \
  --asset-verify-output-file assetctl-verify-assets.out \
  --rollback-drill-evidence-file rollback-drill.txt
```

Inputs:

- `--window-hours` must be at least 24 and required evidence paths must exist
  and be non-empty before the checker opens the database; invalid inputs fail
  during CLI validation.
- `--dead-letter-growth-max` must be zero or positive; negative thresholds are
  invalid checker configuration, not evidence.
- `--nginx-access-log` is required and can be passed more than once. The script counts
  `POST /api/public/image/jobs` 5xx responses and computes create 5xx rate.
  Create access log lines must use the configured nginx log format with a
  numeric HTTP status; malformed create lines are invalid evidence.
  During collector filtering, create access log lines with missing or malformed
  timestamps are also invalid evidence and stop collection before the filtered
  nginx log is written.
  It also requires every create log line to have
  exactly one `route_upstream` value and that value must be
  `route_upstream="http://image-api-go:7810"` to prove nginx routed create
  traffic to Go for the full window. Duplicate `route_upstream` values are
  invalid evidence. Missing nginx access logs block promotion.
- `--render-duration-p95-threshold-seconds` is required, must be positive and
  finite, and must be set from the normal range for the active production
  provider mix.
- Provider failure rate is computed from `image_job_items.error_code` and
  `last_error_code` for provider request/download failures in the observation
  window.
- `--worker-metrics-file` is required and must contain
  `image_worker_heartbeat_failed_total`. Heartbeat failed metric values must be
  present and be non-negative integer counts; missing, fractional, negative,
  NaN, or malformed values are invalid evidence.
- `--asset-verify-output-file` must contain the output from
  `apps/image-runtime-go/cmd/assetctl verify-assets`. Missing asset
  verification output blocks promotion. The output must contain one asset
  summary with `checked=`, `missing=`, and `mismatched=` counts. The `checked=`
  count must be positive; missing summary counts and duplicate `checked=`,
  `missing=`, or `mismatched=` counts are invalid evidence.
- `--rollback-drill-evidence-file` must contain `rollback_drill_passed=true`
  from a controlled rollback drill. Missing or false rollback evidence blocks
  promotion. Missing, multiple, or conflicting rollback result lines are
  invalid evidence and must be regenerated.

The script exits non-zero when any gate fails or when any required external
evidence is missing. Unknown evidence or an empty item window must block
promotion. A report with both
`cutover_decision.go_image_api_read_default_allowed=true` and
`cutover_decision.go_image_api_create_default_allowed=true` is required before
setting Go image API read/create as the default production path. A partial
decision may set read default only when the sole blocking gate is
`create_non_go_upstream_count`; create remains gray through
`next_action=promote_go_image_api_read_keep_create_gray`. Unknown evidence,
asset, worker, rollback, provider, queue, render, 5xx, or timestamp gates keep
both read and create gated.
Collector-side report validation also requires `window_hours >= 24` in the
checker JSON report before copying its decision into `manifest.json`.
The collector rejects checker reports whose `checks` entries contain negative
numeric evidence or a `status` that contradicts the entry's `value`,
`threshold`, and gate direction.
It also requires `summary.items_in_window` to match the `items_in_window` gate,
so the manifest cannot preserve contradictory item-window evidence.
Manifest generation also rejects a checker exit code that contradicts the
checker report's top-level `passed` value.
Only checker exit code `0` or gate-failed exit code `2` are accepted as valid
manifest evidence.
Before making the 9.3 cutover decision from an archived evidence directory, run
`python3 scripts/verify-go-image-api-cutover-evidence.py <evidence-dir>`. It
revalidates `manifest.json`, every artifact byte count and sha256, and the
manifest/report `cutover_decision` match. A valid blocked bundle exits with the
checker's gate-failed code; an invalid bundle exits before any promotion.

## Metrics Naming

Go worker metrics used by this gate:

- `image_worker_queue_wait_seconds`
- `image_worker_render_duration_seconds`
- `image_worker_item_failed_total`
- `image_worker_item_succeeded_total`
- `image_worker_heartbeat_failed_total`
- `image_worker_provider_inflight`

Admin APIs used by this gate:

- `GET /api/admin/image/stats`
- `GET /api/admin/ops/image/queue-summary`
- `GET /api/admin/ops/image/running-items`
- `GET /api/admin/image/dead-letter-items`
- `GET /api/admin/providers`

## Smoke Checklist

### 切流前

- `docker compose config --quiet` succeeds.
- `image-api-go` `/readyz` succeeds.
- `worker-go` `/readyz` and `/metrics` succeed.
- FastAPI fallback flags and rollback command are recorded.
- Admin dashboard can load stats, queue summary, workers, providers, and dead letters.

### 切流中

- Enable or keep `GO_IMAGE_API_READS_ENABLED=true`.
- Enable or keep `GO_IMAGE_API_ASSETS_ENABLED=true`.
- Enable or keep `GO_IMAGE_API_SSE_ENABLED=true`.
- Only set `GO_IMAGE_API_CREATE_ENABLED=true` when
  `go_image_api_create_default_allowed=true`.
- For partial read-default decisions, keep `GO_IMAGE_API_CREATE_ENABLED=false`.
- Reload nginx and confirm create/read traffic reaches `image-api-go`.

### 切流后 15 分钟

- New public create returns `queued`.
- `requested_count` creates the same count of image job items.
- `worker-go` claims queued items and records heartbeats.
- Results, assets, thumbnails, and events are readable.
- Outbox has image job and asset events.
- Dead letter count and provider circuit count do not spike.

### 切流后 24 小时

- Recalculate every Cutover Gate threshold.
- Run `scripts/check-go-image-api-cutover.py` with real external evidence.
- Confirm provider failure rate is below the cutover threshold.
- Confirm no sustained worker heartbeat failed growth.
- Run asset verification or equivalent storage check.
- Confirm fallback flags still return traffic to FastAPI when set false in a
  controlled rollback drill.

## Rollback

Rollback create first:

```env
GO_IMAGE_API_CREATE_ENABLED=false
```

Rollback reads/assets/events if payload or stream compatibility is affected:

```env
GO_IMAGE_API_READS_ENABLED=false
GO_IMAGE_API_ASSETS_ENABLED=false
GO_IMAGE_API_SSE_ENABLED=false
```

Reload nginx:

```bash
docker compose exec nginx nginx -s reload
```

Keep `worker-go` running unless image execution itself is the faulty layer.
