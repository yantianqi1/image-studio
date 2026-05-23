# Go Runtime Cutover

This document covers production release and rollback for Go image runtime. The
current production compose defaults keep public image create/read/results/assets
and events on FastAPI until the 24h Go image API cutover gate passes and nginx
route flags are enabled explicitly.

## Scope

Go image runtime has three separately gated parts:

- `worker-go`: executes `image_job_items`.
- `image-api-go`: owns public image create/read/results/assets/events when
  production flags are enabled.
- Go Core API: may own future billing or quota preflight when flags exist.

The production GHCR workflow publishes the `image-studio-image-api-go` image,
and `docker-compose.yml` starts that service by default.

Local wallet billing was removed. Do not recreate wallet, reservation, redeem,
or pricing tables to satisfy this cutover.

## Render Validation

Start `worker-go` in render mode against a controlled provider and storage
configuration:

```bash
GO_WORKER_MODE=render
GO_WORKER_CONCURRENCY=2
GO_WORKER_PROVIDER_CONCURRENCY_DEFAULT=2
ASSET_STORAGE_BACKEND=local
docker compose up -d worker-go
```

Observe readiness and metrics:

```bash
docker compose exec worker-go wget -qO- http://127.0.0.1:7900/readyz
docker compose exec worker-go wget -qO- http://127.0.0.1:7900/metrics
```

## Render Takeover

Increase concurrency only after the controlled render validation is stable:

```bash
GO_WORKER_MODE=render
GO_WORKER_CONCURRENCY=8
GO_WORKER_PROVIDER_CONCURRENCY_DEFAULT=2
GO_WORKER_PROVIDER_SUPPORT=openai-compatible,openai-chat-compatible,openrouter-chat-image
ASSET_STORAGE_BACKEND=local
docker compose up -d worker-go
```

Provider API keys stay in environment variables referenced by provider rows.
Do not write provider keys into compose files.

## Route Release

Use route flags independently. The pre-cutover defaults keep these flags false;
enable them only after `docs/runbooks/go-image-api-cutover.md` passes with real
traffic evidence:

```bash
GO_IMAGE_API_READS_ENABLED=true
GO_IMAGE_API_ASSETS_ENABLED=true
GO_IMAGE_API_SSE_ENABLED=true
GO_IMAGE_API_CREATE_ENABLED=true
GO_IMAGE_API_GALLERY_ENABLED=false
GO_IMAGE_API_DELETE_ENABLED=false
GO_CORE_API_BILLING_ENABLED=false
GO_CORE_API_QUOTA_ENABLED=false
```

`WORKER_ENABLE_IMAGE_JOBS` is a legacy Python-worker flag. Current Python
worker main does not schedule image jobs, and production docs must not use that
flag to create a hidden fallback path. In older environments where it still
exists, keep `WORKER_ENABLE_IMAGE_JOBS=false`.

Recommended order for a new environment or an explicit staged rollout:

1. Enable Go reads for internal or low-risk traffic.
2. Enable Go create only after read payloads match FastAPI.
3. Keep Go Core billing and quota disabled unless the local environment has a
   real Go Core API implementation and tests for the current schema.
4. Reload nginx after route flag changes.

```bash
docker compose exec nginx nginx -s reload
```

The expected operator event text is `nginx reload`. Confirm that service logs
show the intended path. Public nginx routes must continue stripping debug owner
headers.

## Smoke Checklist

Run this after enabling Go read/create:

- public create returns queued.
- item count matches requested_count.
- worker consumes item.
- result asset readable.
- events include job/item transitions.
- outbox has asset/job event.

If any item fails, keep the failure visible in logs and rows; do not add silent
fallback behavior.

## Rollback

FastAPI fallback is retained through nginx flags. Rollback disables Go route
ownership first:

```bash
GO_IMAGE_API_READS_ENABLED=false
GO_IMAGE_API_ASSETS_ENABLED=false
GO_IMAGE_API_SSE_ENABLED=false
GO_IMAGE_API_CREATE_ENABLED=false
GO_CORE_API_BILLING_ENABLED=false
GO_CORE_API_QUOTA_ENABLED=false
docker compose exec nginx nginx -s reload
```

Then stop `worker-go` only if execution is the faulty layer:

```bash
docker compose stop worker-go
```

Do not silently roll image execution back to Python. The Python image executor
is legacy/manual/test-only. If running items exist, wait for leases to expire
and restart `worker-go` after the root cause is fixed.

After rollback, check:

- `queued`, `running`, `failed`, and `dead_letter` item counts.
- stale running leases.
- provider circuit state.
- missing generated assets.
- Go and FastAPI route owner logs.

## Failure Checklist

### queue 堆积

Check `worker-go` readiness, DB locks, provider circuit state, and
`queue_wait_seconds.p95`. Increase concurrency only after provider and DB
capacity are confirmed.

### provider 熔断

Leave a failing provider paused or circuit-open. Resume only after external
provider health is confirmed, then retry a small dead-letter batch.

### billing reconcile failed

Run:

```bash
python3 scripts/reconcile-image-billing.py --dry-run
```

The current schema reports local billing as removed. Reconcile provider usage
events and aggregated job costs only; do not recreate wallet tables.

### asset missing

Verify `ASSET_STORAGE_BACKEND`, local volume or GCS credentials, then run:

```bash
cd apps/image-runtime-go
go run ./cmd/assetctl verify-assets --limit 1000
```

### DB migration failed

Stop writers, restore the Postgres backup, redeploy the previous image, then
restart `worker-go` only after readiness checks pass.

## Security

- Keep pprof bound to internal interfaces only; never expose it through public
  nginx routes.
- Require `INTERNAL_SERVICE_TOKEN` for internal Go Core or image API calls.
- Do not log API keys, authorization headers, full prompts, or base64 images.
- Treat missing internal token as a hard failure, not a fallback to public
  behavior.
