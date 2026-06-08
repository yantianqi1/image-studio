# Image Runtime Runbook

This runbook covers the production image runtime: FastAPI public/admin image
APIs, `image-api-go`, `worker-go`, Postgres image tables, and generated asset
storage. The `image-api-go` container image is built and pushed by
`.github/workflows/build-ghcr-images.yml`, then pulled by `docker-compose.yml`.
Production image execution belongs to Go worker. Python image execution is
deprecated and must not be used as a silent production fallback.

## First Checks

Run these before changing state:

```bash
docker compose ps api image-api-go worker-go worker postgres nginx
docker compose logs --tail=200 worker-go image-api-go api
docker compose exec worker-go wget -qO- http://127.0.0.1:7900/readyz
docker compose exec worker-go wget -qO- http://127.0.0.1:7900/metrics
```

Confirm:

- API accepts `POST /api/public/image/jobs`.
- `image_jobs` and `image_job_items` rows are created.
- `worker-go` claims `queued` items and updates heartbeats.
- `image_job_events` emits item and job status events.
- Assets are written to local storage or GCS according to
  `ASSET_STORAGE_BACKEND`.

## Go Image API Cutover Path

Go image API can become the production primary path for public image
create/read/results/assets/events after the 24h cutover gate passes. FastAPI
stays the default route owner before that gate, and remains the explicit
rollback fallback after cutover.

Use `docs/runbooks/go-image-api-cutover.md` for the full-traffic cutover gate,
SLO thresholds, known metric gaps, and 15 minute / 24 hour smoke checks.

Pre-cutover defaults:

```env
GO_IMAGE_API_READS_ENABLED=false
GO_IMAGE_API_ASSETS_ENABLED=false
GO_IMAGE_API_SSE_ENABLED=false
GO_IMAGE_API_CREATE_ENABLED=false
GO_IMAGE_API_GALLERY_ENABLED=false
GO_IMAGE_API_DELETE_ENABLED=false
```

`image-api-go` and `worker-go` must both be running before these flags route
traffic to Go. `GO_IMAGE_API_GALLERY_ENABLED` and
`GO_IMAGE_API_DELETE_ENABLED` stay disabled by default because gallery and
delete are not part of the create/read production primary path yet.

### Enable Go read/create

1. Deploy the current `api`, `image-api-go`, `worker-go`, and `nginx` images.
2. Confirm `image-api-go` readiness:

```bash
docker compose exec image-api-go wget -qO- http://127.0.0.1:7810/readyz
```

3. After the 24h gate passes, set the route flags explicitly:

```env
GO_IMAGE_API_READS_ENABLED=true
GO_IMAGE_API_ASSETS_ENABLED=true
GO_IMAGE_API_SSE_ENABLED=true
GO_IMAGE_API_CREATE_ENABLED=true
```

4. Reload nginx:

```bash
docker compose exec nginx nginx -s reload
```

### Smoke checklist

- public create returns queued.
- item count matches requested_count.
- worker consumes item.
- result asset readable.
- events include job/item transitions.
- outbox has asset/job event.

Use a small request with `requested_count=2`, then check:

```bash
docker compose logs --tail=200 image-api-go worker-go api
docker compose exec worker-go wget -qO- http://127.0.0.1:7900/metrics
```

Query the database for `image_jobs`, `image_job_items`,
`image_job_results`, `assets`, `image_job_events`, and `outbox_events`.
Failures must stay visible in logs or rows; do not add silent fallback behavior.

### FastAPI fallback rollback

Rollback create first if only submission is affected:

```env
GO_IMAGE_API_CREATE_ENABLED=false
```

Rollback reads/assets/events if returned payloads or streaming are affected:

```env
GO_IMAGE_API_READS_ENABLED=false
GO_IMAGE_API_ASSETS_ENABLED=false
GO_IMAGE_API_SSE_ENABLED=false
```

Reload nginx after changing flags:

```bash
docker compose exec nginx nginx -s reload
```

After rollback, confirm matching public image requests are served by FastAPI
and leave `worker-go` running unless execution itself is the faulty layer.

## Alerts

Page an operator when any threshold stays true for two consecutive checks:

| Alert | Threshold | Primary evidence |
| --- | --- | --- |
| Queue wait | `queue_wait_p95 > 120s` | benchmark summary or metrics endpoint |
| Failed rate | `failed_rate > 10%` | item status counts over the last 15 minutes |
| Dead letters | `dead_letter_count > 0` | admin dead-letter API or DB query |
| Provider circuit | `provider_circuit_open` | `provider_runtime_state.status = circuit_open` |
| Worker heartbeat | `worker_heartbeat_failed` | no fresh running item heartbeat, worker logs unhealthy |
| Asset write | `asset_write_failed` | worker logs, missing asset object, failed item error code |
| Billing reconcile | `billing_reconcile_failed` | reconcile script exits non-zero or usage gap remains |

## 队列堆积

Incident label: `queue 堆积`.

Symptoms: queue depth rises, `queue_wait_p95 > 120s`, jobs remain `queued`.

1. Check `worker-go` readiness and logs.
2. Check provider circuits and paused providers.
3. Check DB locks and slow queries around `image_job_items`.
4. Raise `GO_WORKER_GLOBAL_CONCURRENCY` only after confirming provider and DB
   capacity. Do not exceed the provider limits in `apps/worker-go/README.md`.
5. Run a benchmark summary to capture the baseline before and after changes:

```bash
DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/image_studio \
python3 scripts/bench-image-jobs.py summary --metrics-url http://127.0.0.1:7900/metrics
```

## provider 熔断

Incident label: `provider 熔断`.

Symptoms: provider runtime state is `circuit_open`, many items carry provider
request errors, new items for that provider are not claimed.

1. Confirm provider health externally and in admin Provider Health.
2. If the provider is still failing, leave the circuit open.
3. If it recovered, use admin provider resume controls or clear only the
   specific provider runtime state after recording the incident.
4. Retry dead-letter items through admin APIs after the provider is healthy.

## 大量 failed

Symptoms: `failed_rate > 10%`, item `error_message` values cluster around one
provider, model, storage backend, or prompt class.

1. Group failures by `error_code`, provider, model, and owner.
2. If errors are retryable provider failures, wait for circuit state or retry a
   small batch from Dead Letter.
3. If errors are validation failures, do not retry automatically; fix the
   request path or model catalog first.
4. Keep failed rows visible. Do not mark failures succeeded manually.

## Dead Letter Recovery

Use admin Dead Letter to inspect item payloads and retry manually.

```text
GET  /api/admin/image/dead-letter-items
POST /api/admin/image/items/{item_id}/retry
POST /api/admin/image/items/{item_id}/cancel
```

Retry only after the underlying provider, asset, or catalog issue is fixed.
Cancel only when the requested output should not continue.

## asset 文件缺失

Incident label: `asset missing`.

Symptoms: `asset_write_failed`, result row exists but asset URL returns 404, or
thumbnail rebuild fails.

1. Confirm `ASSET_STORAGE_BACKEND`, `GENERATED_ASSETS_DIR`, and GCS credentials.
2. For local storage, check the mounted `generated_assets_data` volume.
3. For GCS, check bucket permissions and object prefix.
4. Run asset verification:

```bash
cd apps/image-runtime-go
go run ./cmd/assetctl verify-assets --limit 1000
```

5. Rebuild only missing thumbnails:

```bash
cd apps/image-runtime-go
go run ./cmd/assetctl rebuild-thumbnails --missing-only
```

## Billing Reconcile

Local wallet tables were removed. Billing reconcile means auditing image
provider usage events and external billing records.

```bash
python3 scripts/reconcile-image-billing.py --dry-run
```

Treat any non-zero exit as `billing_reconcile_failed`. Do not recreate local
wallet, reservation, or billing tables.

The searchable incident label is `billing reconcile`.

## DB migration

Before a migration:

1. Take a Postgres backup.
2. Record current worker versions and `docker compose config`.
3. Stop `worker-go` if the migration changes image queue schema.
4. Apply the migration.
5. Run readiness and targeted API tests.
6. Start `worker-go` and confirm claims resume.

If migration fails, stop writers, restore the Postgres backup, and redeploy the
previous image. Do not let mixed schema workers continue claiming items.

## Backups

Required backups:

- Postgres backup: schedule at least daily and before every migration.
- generated-assets backup: back up local generated asset volume when using
  local storage.
- GCS bucket lifecycle: retain generated originals and thumbnails according to
  product retention policy; enable versioning before bulk migration.

Restore order:

1. Restore Postgres.
2. Restore generated asset files or verify GCS object availability.
3. Run `asset verify`.
4. Run `billing reconcile`.
5. Restart API, `image-api-go`, and `worker-go`.

## Go Worker Recovery

If `worker-go` is unhealthy:

1. Stop only `worker-go`.
2. Inspect logs and provider/storage config.
3. Wait for running item leases to expire if needed.
4. Restart `worker-go`.

Do not roll production image execution back to the Python worker. The Python
image helper is for explicit manual repair of legacy rows without
`image_job_items`.

## 压测基线

Use `docs/perf/image-worker-benchmark.md` for the benchmark procedure.

Minimum baseline before production changes:

- 100 single-item jobs.
- 100 jobs with 4 items.
- 1000 items with the target `GO_WORKER_GLOBAL_CONCURRENCY`.
- Recorded `queue_wait_seconds.p95`.
- Recorded `processing_duration_seconds.p95`.
- Raw worker metrics saved with the benchmark summary.
