# Go Image Worker Benchmark

This benchmark is for non-production environments only. The seed command refuses to write when `APP_ENV=production` unless `--allow-production` is explicitly passed.

## Mock Provider

Start an OpenAI chat compatible mock provider:

```bash
python3 scripts/bench-image-jobs.py mock-provider --port 17900 --delay-ms 30000 --fail-rate 0 --image-format png
```

Configure a local provider row to point at:

```text
http://127.0.0.1:17900/v1
```

## Seed Jobs

Create 100 single-item jobs:

```bash
APP_ENV=benchmark DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/image_studio \
python3 scripts/bench-image-jobs.py seed --jobs 100 --items-per-job 1 --owner-count 25 --provider-id 1 --model-code gpt-image-2 --mode simulate
```

Create 100 jobs with 4 items each:

```bash
APP_ENV=benchmark DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/image_studio \
python3 scripts/bench-image-jobs.py seed --jobs 100 --items-per-job 4 --owner-count 25 --provider-id 1 --model-code gpt-image-2 --mode render-mock
```

Create 1000 items for `GO_WORKER_CONCURRENCY=8`:

```bash
GO_WORKER_CONCURRENCY=8 APP_ENV=benchmark DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/image_studio \
python3 scripts/bench-image-jobs.py seed --jobs 250 --items-per-job 4 --owner-count 50 --provider-id 1 --model-code gpt-image-2 --mode render-mock
```

Provider delay 30 seconds:

```bash
python3 scripts/bench-image-jobs.py mock-provider --delay-ms 30000 --fail-rate 0 --image-format png
```

## Summary

Collect DB status counts, queue wait, processing duration, DB connection usage, and worker metrics:

```bash
DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/image_studio \
python3 scripts/bench-image-jobs.py summary --metrics-url http://127.0.0.1:7900/metrics --json-output perf-results/worker-go-$(date +%Y%m%d-%H%M%S).json
```

The summary includes:

- `status_counts`
- `queue_wait_seconds.avg/p50/p95`
- `processing_duration_seconds.avg/p50/p95`
- `db_connections.pg_stat_activity_connections`
- raw Prometheus text when `--metrics-url` is provided

Do not commit large files under `perf-results/`.
