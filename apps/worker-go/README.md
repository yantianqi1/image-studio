# Go image worker

`apps/worker-go` is the Go worker for `image_job_items`.

It defaults to simulation mode. It connects to Postgres, claims queued
`image_job_items`, refreshes the item heartbeat lease, sleeps for
`GO_WORKER_SIMULATE_SECONDS`, then marks the item `succeeded` or `failed` based
on `GO_WORKER_FAIL_SIMULATION` and aggregates the parent `image_jobs` status.

Set `GO_WORKER_MODE=render` to enable real image rendering. Render mode supports
`openai-compatible`, `openai-chat-compatible`, and `openrouter-chat-image`
providers. System providers read `base_url`, `api_key_env`, and `default_model`
from `providers` and load API keys from environment variables. Client providers
read `provider_type`, `base_url`, `api_key`, and optional `model` /
`provider_model` plus `client_id` from `image_jobs.client_provider_config`;
user API keys are used directly and are not read from environment variables.

In render mode the claim query is intentionally limited to Go-supported provider
types, so unsupported provider types stay available for the Python worker legacy
fallback.

Concurrency controls:

```bash
GO_WORKER_CONCURRENCY=2
GO_WORKER_PROVIDER_CONCURRENCY_DEFAULT=2
GO_WORKER_PROVIDER_CONCURRENCY_OVERRIDES=openrouter=2,openai-official=3
GO_WORKER_OWNER_CONCURRENCY=1
GO_WORKER_MODEL_CONCURRENCY_DEFAULT=2
```

Render mode only supports `ASSET_STORAGE_BACKEND=local`. `gcs` returns an
explicit unsupported error in this first migration step.

HTTP diagnostics default to `GO_WORKER_ENABLE_HTTP=true` on `GO_WORKER_HTTP_ADDR=:7900`:

- `GET /healthz`
- `GET /readyz`
- `GET /metrics`

## Local run

Set `DATABASE_URL` to a Postgres database that contains the app schema, then run:

```bash
cd apps/worker-go && go run ./cmd/image-worker
```

For render mode, set:

```bash
GO_WORKER_MODE=render
ASSET_STORAGE_BACKEND=local
GENERATED_ASSETS_DIR=./generated-assets
```

Run tests from this directory:

```bash
go test -timeout=60s ./...
```

Dry-run orphan generated asset cleanup:

```bash
go run ./cmd/image-worker cleanup-orphan-assets
go run ./cmd/image-worker cleanup-orphan-assets --execute
```

## Docker compose migration run

During migration, keep the Python worker responsible for `comic-task` and
`comic-orchestration`; its `image_jobs` branch defaults off and should only be
enabled as a legacy fallback for old jobs without `image_job_items`:

```bash
WORKER_ENABLE_IMAGE_JOBS=false
GO_WORKER_MODE=render
docker compose --profile worker-go up -d worker worker-go
```

The `worker-go` compose service is opt-in. Keep `GO_WORKER_MODE=simulate` until
you are ready for the Go worker to call the real provider. Use
`docs/deploy/go-worker-cutover.md` for simulate, render, and rollback steps.
