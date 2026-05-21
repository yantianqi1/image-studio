# Go Worker Image Job Cutover

The Go worker is the recommended executor for `image_job_items`. Keep the Python worker enabled for `comic-task` and `comic-orchestration`; keep its image job branch off during Go render takeover.

## Simulate Validation

```bash
WORKER_ENABLE_IMAGE_JOBS=false
GO_WORKER_MODE=simulate
GO_WORKER_CONCURRENCY=2
GO_WORKER_PROVIDER_CONCURRENCY_DEFAULT=2
docker compose --profile worker-go up -d worker worker-go
```

Check:

```bash
docker compose ps worker-go
docker compose exec worker-go wget -qO- http://127.0.0.1:7900/readyz
docker compose exec worker-go wget -qO- http://127.0.0.1:7900/metrics
```

## Render Takeover

```bash
WORKER_ENABLE_IMAGE_JOBS=false
GO_WORKER_MODE=render
GO_WORKER_CONCURRENCY=8
GO_WORKER_PROVIDER_CONCURRENCY_DEFAULT=2
GO_WORKER_PROVIDER_CONCURRENCY_OVERRIDES=openrouter=2,openai-official=2
ASSET_STORAGE_BACKEND=local
docker compose --profile worker-go up -d worker worker-go
```

Startup validation fails fast when:

- `DATABASE_URL` is not Postgres in render mode
- `ASSET_STORAGE_BACKEND` is not `local`
- the Go render provider support list is empty

It logs warnings when `WORKER_ENABLE_IMAGE_JOBS=true` is visible or `GO_WORKER_CONCURRENCY > 32`.

`/readyz` checks DB ping, required tables, and local storage write/delete in render mode.

## Rollback

Stop the Go worker:

```bash
docker compose --profile worker-go stop worker-go
```

Temporarily restore Python image job consumption:

```bash
WORKER_ENABLE_IMAGE_JOBS=true
docker compose up -d worker
```

Do not keep both workers consuming image jobs. If Go worker stopped while items were `running`, wait for their lease to expire; the queue claim logic will retry eligible queued work after `lease_expires_at`.
