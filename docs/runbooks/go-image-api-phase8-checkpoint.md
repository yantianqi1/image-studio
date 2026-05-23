# Go Image API Phase 8 Checkpoint

Date: 2026-05-22

Suggested commit message:

```text
stabilize go image api create cutover path
```

## Scope

This checkpoint covers the Phase 8 production-path closure for Go image API:

- Go image API read/create/results/assets/events are ready for cutover
  evaluation, but are not the default route owner until the 24h gate passes.
- FastAPI public image routes remain the default before cutover and the explicit
  rollback fallback behind `GO_IMAGE_API_*_ENABLED=false`.
- `worker-go` remains the production executor for `image_job_items`.
- Python image execution remains deprecated manual/test-only code.
- FastAPI image legacy sunset is documented, but routes and helpers are not
  removed in this phase.

## Files To Include

- `.env.example`
- `docker-compose.yml`
- `docs/deploy/go-runtime-cutover.md`
- `docs/deploy/go-worker-cutover.md`
- `docs/go-image-api-shadow.md`
- `docs/runbooks/go-core-api.md`
- `docs/runbooks/image-runtime.md`
- `docs/runbooks/go-image-api-cutover.md`
- `docs/runbooks/go-image-api-phase8-checkpoint.md`
- `docs/architecture/python-image-legacy.md`
- `docs/architecture/fastapi-image-legacy-sunset.md`
- `infra/nginx/README.md`
- `apps/api/app/domains/image/stats_service.py`
- `apps/api/tests/test_admin_image_jobs.py`
- `apps/admin-web/src/features/jobs/image-job-stats.tsx`
- `apps/admin-web/src/lib/admin-image-job-types.ts`
- `apps/admin-web/tests/admin-image-jobs.test.mjs`
- `scripts/collect-go-image-api-cutover-evidence.sh`
- `scripts/go-image-api-cutover-collector-preflight.sh`
- `scripts/check-go-image-api-cutover.py`
- `scripts/go_image_api_cutover_check_lib.py`
- `scripts/go_image_api_cutover_collect_lib.py`
- `scripts/go_image_api_cutover_evidence.py`
- `scripts/go_image_api_cutover_bundle.py`
- `scripts/verify-go-image-api-cutover-evidence.py`
- `tests/test_go_dockerfiles.py`
- `tests/go_image_api_cutover_test_helpers.py`
- `tests/test_go_image_api_cutover_asset_evidence.py`
- `tests/test_go_image_api_cutover_bundle.py`
- `tests/test_go_image_api_cutover_cli_args.py`
- `tests/test_go_image_api_cutover_collector_preflight.py`
- `tests/test_go_image_api_cutover_collect.py`
- `tests/test_go_image_api_cutover_check.py`
- `tests/test_go_image_api_cutover_external_evidence.py`
- `tests/test_go_image_api_cutover_gate_names.py`
- `tests/test_go_image_api_cutover_metrics_evidence.py`
- `tests/test_go_image_api_cutover_time.py`
- `apps/api/tests/test_python_image_legacy_docs.py`
- `apps/worker/worker/tasks/image_jobs.py`

## Files Not To Include Without Separate Review

- `apps/public-web/**` existing dirty worktree changes.
- `generated-assets/**` local render output.
- `trace-public-web.json` local trace output.
- `参考资源信息/**`, including any local sensitive data.
- `.codex/skills/comic-studio-workflow/**`.
- Phase plan text files.
- `scripts/reconcile-image-billing.py` and its test unless separately scoped.

## Verification Commands

Run these before committing the checkpoint:

```bash
go test ./... -count=1 -timeout 60s
```

Run the Go command separately in:

- `apps/image-api-go`
- `apps/worker-go`
- `apps/image-runtime-go`

Backend and contract checks:

```bash
python3.13 -c 'import subprocess, sys; sys.exit(subprocess.run(["python3.13", "-m", "pytest", "-q", "tests/test_go_dockerfiles.py", "apps/api/tests/test_python_image_legacy_docs.py", "apps/api/tests/test_worker_branch_switches.py", "apps/api/tests/test_image_jobs.py::test_create_image_job_queues_without_direct_rendering"], timeout=60).returncode)'
python3.13 -c 'import subprocess, sys; sys.exit(subprocess.run(["python3.13", "-m", "pytest", "tests/test_go_image_api_cutover_collect.py", "tests/test_go_image_api_cutover_collector_preflight.py", "tests/test_go_image_api_cutover_report_schema.py", "tests/test_go_image_api_cutover_check.py", "tests/test_go_image_api_cutover_gate_names.py", "tests/test_go_image_api_cutover_external_evidence.py", "tests/test_go_image_api_cutover_cli_args.py", "tests/test_go_image_api_cutover_asset_evidence.py", "tests/test_go_image_api_cutover_metrics_evidence.py", "tests/test_go_image_api_cutover_nginx_evidence.py", "tests/test_go_image_api_cutover_rollback_evidence.py", "tests/test_go_image_api_cutover_time.py", "-q"], timeout=60).returncode)'
python3.13 -c 'import subprocess, sys; sys.exit(subprocess.run(["python3.13", "-m", "pytest", "-q", "tests/contracts"], timeout=60).returncode)'
```

Admin and compose checks:

```bash
pnpm exec node --test apps/admin-web/tests/*.mjs
pnpm build:admin
docker compose config --quiet
```

## Last Local Verification

2026-05-22 local verification:

| Command | Result |
| --- | --- |
| `go test ./... -count=1 -timeout 60s` in `apps/image-api-go` | pass |
| `go test ./... -count=1 -timeout 60s` in `apps/worker-go` | pass |
| `go test ./... -count=1 -timeout 60s` in `apps/image-runtime-go` | pass |
| cutover checker, CLI, collector, report schema, metrics, nginx, asset, rollback, external evidence, and time tests through 60s wrapper | 93 passed |
| Dockerfile, legacy docs, worker branch, and queued-create backend tests through 60s wrapper | 18 passed |
| image API contract tests through 60s wrapper | 6 passed |
| Dockerfile, legacy docs, and nginx config anchor tests through 60s wrapper | 22 passed |
| admin/public focused node tests | 68 passed |
| `pnpm typecheck:public` | pass |
| `pnpm typecheck:admin` | pass |
| `docker compose config --quiet` | pass |

## Non-Code Production Gate

The checkpoint is deployable only after the production cutover gate in
`docs/runbooks/go-image-api-cutover.md` is evaluated against real traffic.
Use `scripts/collect-go-image-api-cutover-evidence.sh` or
`scripts/check-go-image-api-cutover.py` with real external evidence for the
24 hour gate:

- create 5xx rate < 0.5%
- at least 1 image item in the observation window
- image item terminal failure rate < 3%
- provider failure rate < 3%
- collector preflight records service, route flag, worker mode, and asset
  storage evidence
- queue wait p95 < 120s
- render duration p95 within the normal provider range
- outbox pending oldest age < 60s
- dead letter count has no abnormal growth
- worker heartbeat failed has no consecutive alerts
- asset missing count = 0

Missing or unknown production evidence must keep the cutover checker failing.
Do not convert unknown production evidence into synthetic success.

## Phase 9 Dev Follow-up

2026-05-22 local development follow-up:

- Real 24 hour production or staging validation was skipped in local dev, so
  this checkpoint remains blocked on the non-code production gate above.
- `scripts/check-go-image-api-cutover.py` rejects observation windows shorter
  than 24 hours.
- Gate thresholds documented as strictly below the limit now fail at the exact
  boundary for create 5xx rate, item terminal failure rate, provider failure
  rate, queue wait p95, and outbox pending oldest age.
- DB item timestamp integrity is explicit gate evidence; negative queue wait or
  render duration samples fail instead of being hidden from p95 calculations.
  Timezone-aware DB timestamps are normalized to UTC before comparison.
- External evidence files containing placeholder markers such as `TODO`, `TBD`,
  `FIXME`, `synthetic`, `mock`, `synthetic_success`, or `mock_pass` are
  rejected before parsing.
- The cutover CLI requires `--rollback-drill-evidence-file`; it does not accept
  a bare boolean rollback success flag. Rollback drill evidence with missing,
  multiple, or conflicting result lines is rejected.
- The cutover CLI requires nginx access logs, worker metrics, assetctl verify
  output, and rollback drill evidence files; manual count flags are not accepted
  as production cutover evidence.
- Nginx evidence rejects malformed create access log lines and duplicate
  `route_upstream` values instead of silently treating them as missing or
  first-match create traffic evidence.
- The collector's nginx filter rejects create access log lines with missing or
  malformed timestamps before writing the filtered evidence file, so malformed
  create traffic cannot be hidden by the time-window filter.
- `--window-hours < 24`, non-positive or non-finite render p95 thresholds, and
  missing or empty evidence paths fail during CLI validation before database
  checks run.
- Negative `--dead-letter-growth-max` values fail during CLI validation and
  direct checker report building.
- Worker metrics evidence must contain `image_worker_heartbeat_failed_total`,
  and its values must be non-negative integer counts. Missing, fractional,
  negative, NaN, or malformed values are rejected instead of being ignored or
  truncated.
- Asset verification evidence must include `checked=`, `missing=`, and
  `mismatched=` counts. Missing or zero `checked=`, missing `missing=` or
  `mismatched=`, or duplicate count fields are rejected instead of using an
  incomplete summary line.
- The collector validates `go-image-api-cutover-report.json` before writing the
  manifest; empty, invalid, schema-incomplete, or empty-check reports fail
  immediately.
- Collector report validation requires a top-level `window_hours` integer of at
  least 24, so hand-built reports cannot omit the observation window.
- Collector validation requires `summary.items_in_window` and rejects reports
  where it does not match the `items_in_window` gate value.
- `go-image-api-cutover-report.json` now includes `cutover_decision`; read/create
  defaults stay disabled unless both default-allowed fields are true. Collector
  validation also rejects incomplete or contradictory `cutover_decision` values.
- `cutover_decision` includes `failed_checks` and `unknown_checks`, so skipped
  or missing 24 hour evidence is visible in the decision payload instead of only
  the raw gate list.
- Collector validation requires those check-name lists to exist and contain only
  strings, and to match the report's actual `checks` entries for `status=fail`
  and `status=unknown`, before copying the decision into `manifest.json`.
- Collector validation rejects malformed `checks` entries and reports where the
  top-level `passed` value contradicts the presence or absence of fail/unknown
  gates.
- Collector validation requires every `checks` entry to carry typed `value` and
  `threshold` evidence fields; missing fields or placeholder strings such as
  `TODO`, plus non-finite floats such as `NaN` or `Infinity`, are invalid even
  when the entry claims `status=pass`.
- Collector validation rejects negative numeric `value` or `threshold` fields
  and recomputes each `pass` or `fail` status from the entry's
  `value`/`threshold` pair and gate direction.
- Collector validation rejects `pass` or `fail` checks with null `value` or
  `threshold`, and rejects `unknown` checks that carry complete value and
  threshold evidence.
- Collector validation enforces gate-specific evidence types: only
  `rollback_drill_passed` may use boolean `value` and `threshold`; numeric
  cutover gates reject boolean evidence values.
- Collector validation rejects checker reports missing any required cutover
  gate, containing duplicate gate names, containing unexpected extra gates, or
  drifting from checker output order.
- The required cutover gate list is exported by the checker and reused by the
  collector, so report validation must match checker output order exactly.
- `manifest.json` copies the same validated `cutover_decision` from the checker
  report for evidence bundle review.
- `manifest.json` generation rejects a checker exit code that contradicts
  `go-image-api-cutover-report.json`'s top-level `passed` value.
- `manifest.json` generation only accepts checker exit code `0` or gate-failed
  exit code `2`; other exit codes are treated as collector/checker execution
  errors, not valid cutover evidence.
- The cutover CLI rejects missing `--render-duration-p95-threshold-seconds`
  instead of downgrading render duration evidence to an unknown check.
- The collector reads the running nginx container's
  `/var/log/nginx/access.log` and filters it to `WINDOW_HOURS`; it does not use
  container stdout/stderr logs as access-log evidence.
- `manifest.json` records 64-character hex sha256 for both raw and filtered
  nginx access log artifacts.
- `manifest.json` generation rejects missing, duplicate, unexpected,
  zero-byte, path-drift, or malformed-hash evidence artifacts before writing
  the bundle index.
- `manifest.json` generation also validates top-level window, UTC generation
  timestamp, verify limit, render p95 threshold, and checker exit code values
  before writing.
- `manifest.json` generation validates that the copied `cutover_decision` is
  complete and consistent with the checker exit code; gate-failed manifests
  must list non-duplicated blocking checks from the canonical cutover gate list,
  no gate can appear in both `failed_checks` and `unknown_checks`, and each
  blocking list must keep canonical gate order.
- 9.3 partial cutover is machine-readable: only
  `create_non_go_upstream_count` may block create while allowing read default;
  all unknown evidence and every other gate keeps read/create gated.
- `scripts/verify-go-image-api-cutover-evidence.py` revalidates archived
  evidence bundles before 9.3 review: `manifest.json`, artifact byte
  counts/sha256, and the manifest/report `cutover_decision` must match.
- The collector rejects non-integer `WINDOW_HOURS` values and windows below 24
  hours before touching Docker or writing evidence artifacts.
- The collector rejects missing `DATABASE_URL`, missing
  `RENDER_DURATION_P95_THRESHOLD_SECONDS`, missing
  `ROLLBACK_DRILL_EVIDENCE_FILE`, non-numeric render p95 thresholds, and
  non-integer `VERIFY_LIMIT` values before touching Docker or writing evidence
  artifacts.
- The collector rejects non-positive `RENDER_DURATION_P95_THRESHOLD_SECONDS`
  and non-positive `VERIFY_LIMIT` values before touching Docker or writing
  evidence artifacts.
- The collector rejects missing or empty `ROLLBACK_DRILL_EVIDENCE_FILE` before
  writing evidence artifacts.
- The collector rejects rollback drill files containing placeholder markers
  including `TODO`, `synthetic_success`, and `mock_pass` before touching Docker
  or writing evidence artifacts.
- The collector rejects rollback drill files missing
  `rollback_drill_passed=true`, reporting `rollback_drill_passed=false`, or
  containing multiple rollback drill result lines before touching Docker or
  writing evidence artifacts.
- The collector preflight tests execute these invalid-input branches directly
  and verify no evidence directory is created.
