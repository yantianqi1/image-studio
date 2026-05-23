# Go image worker

`apps/worker-go` is the Go worker for `image_job_items`.

It defaults to render mode and writes real generated assets. The legacy
`GO_WORKER_MODE=simulate` mode is not a success path: it never marks generated
output as succeeded and must not be used as production execution.

Render mode supports
`openai-compatible`, `openai-chat-compatible`, and `openrouter-chat-image`
providers. System providers read `base_url`, `api_key_env`, and `default_model`
from `providers` and load API keys from environment variables. Client providers
read `provider_type`, `base_url`, `api_key`, and optional `model` /
`provider_model` plus `client_id` from `image_jobs.client_provider_config`;
user API keys are used directly and are not read from environment variables.

In render mode the claim query is intentionally limited to Go-supported provider
types. Unsupported provider types require an explicit manual legacy repair path;
they must not be routed through the Python worker as production fallback.

Concurrency controls:

```bash
GO_WORKER_GLOBAL_CONCURRENCY=2
GO_WORKER_PROVIDER_CONCURRENCY_DEFAULT=2
GO_WORKER_PROVIDER_CONCURRENCY_OVERRIDES=openrouter=2,openai-official=3
GO_WORKER_OWNER_CONCURRENCY=1
GO_WORKER_ANONYMOUS_OWNER_CONCURRENCY=1
GO_WORKER_MODEL_CONCURRENCY_DEFAULT=2
GO_WORKER_PROVIDER_CIRCUIT_FAILURE_THRESHOLD=5
GO_WORKER_PROVIDER_CIRCUIT_OPEN_SECONDS=300
```

`GO_WORKER_CONCURRENCY` is still accepted for existing deployments when
`GO_WORKER_GLOBAL_CONCURRENCY` is not set. New deployments should use
`GO_WORKER_GLOBAL_CONCURRENCY`.

Render mode supports `ASSET_STORAGE_BACKEND=local` and `gcs`. The render claim
query skips providers whose `provider_runtime_state.status` is `paused`, and it
does not claim `circuit_open` providers until `circuit_open_until` has passed.
System provider `provider_request_failed` errors increment
`provider_runtime_state.failure_count`; reaching
`GO_WORKER_PROVIDER_CIRCUIT_FAILURE_THRESHOLD` opens the circuit for
`GO_WORKER_PROVIDER_CIRCUIT_OPEN_SECONDS`. Client provider failures are scoped
to the user-supplied key and do not update shared provider runtime state.

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

Legacy orphan generated asset cleanup wrapper:

```bash
go run ./cmd/image-worker cleanup-orphan-assets --dry-run
go run ./cmd/image-worker cleanup-orphan-assets --execute
```

The shared asset operations CLI lives in `../image-runtime-go/cmd/assetctl`.
The production `worker-go` image also includes it at `/app/assetctl`, so
cutover evidence collection runs asset verification inside the same container
environment and mounted asset storage used by the renderer.
Run these from `apps/image-runtime-go`:

```bash
go run ./cmd/assetctl scan-orphans --dry-run
go run ./cmd/assetctl scan-orphans --execute
go run ./cmd/assetctl verify-assets --limit 1000
go run ./cmd/assetctl rebuild-thumbnails --missing-only
```

## Docker compose migration run

During migration, keep the Python worker responsible for `comic-task` and
`comic-orchestration`. It does not expose a production `image_jobs` branch;
legacy rows without `image_job_items` require an explicit manual repair helper:

```bash
GO_WORKER_MODE=render
docker compose --profile worker-go up -d worker worker-go
```

The `worker-go` compose service is opt-in in local profiles and defaults to
render mode in production compose. Use `docs/deploy/go-worker-cutover.md` for
render and rollback steps.
