# Go image worker

`apps/worker-go` is the Go worker for `image_job_items`.

It defaults to simulation mode. It connects to Postgres, claims queued
`image_job_items`, refreshes the item heartbeat lease, sleeps for
`GO_WORKER_SIMULATE_SECONDS`, then marks the item `succeeded` or `failed` based
on `GO_WORKER_FAIL_SIMULATION` and aggregates the parent `image_jobs` status.

Set `GO_WORKER_MODE=render` to enable real image rendering. Render mode currently
supports `openai-chat-compatible` providers through `/chat/completions`, reads
the provider `base_url`, `api_key_env`, and `default_model` from `providers`,
loads API keys from environment variables, writes local asset files, inserts
`assets` and `image_job_results`, and then marks the item `succeeded`.

In render mode the claim query is intentionally limited to
`openai-chat-compatible` parent jobs without `client_provider_config`, so
unmigrated provider types stay available for the Python worker legacy fallback.

Render mode only supports `ASSET_STORAGE_BACKEND=local`. `gcs` returns an
explicit unsupported error in this first migration step.

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
you are ready for the Go worker to call the real provider.
