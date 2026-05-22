# Worker Control Plane Runbook

This runbook covers the Go worker runtime control plane for `worker-go`.
The current admin ops API is exposed through FastAPI at `/api/admin/ops/*` so
the existing admin-web can operate the same tables that Go workers read.

## Tables

- `worker_nodes`: one row per Go worker process.
- `worker_runtime_config`: JSON runtime overrides keyed by `config_key`.
- `runtime_ops_events`: append-only operator/runtime events.

Worker status values:

- `starting`: reserved for future startup staging.
- `running`: worker may claim new queued items.
- `draining`: worker must stop claiming new items and finish running items.
- `stopped`: worker shutdown completed.
- `unhealthy`: reserved for future health classification.

## Runtime Config

Default key: `worker-go`.

Supported JSON fields:

```json
{
  "concurrency": 4,
  "poll_interval_seconds": 2,
  "provider_concurrency_default": 2,
  "drain": false
}
```

Only set fields override env defaults. Invalid positive integer fields make the
worker control refresh fail and emit logs/metrics; they are not ignored.

## Drain A Worker

Node-level drain stops only one worker:

```bash
curl -X POST /api/admin/ops/workers/<worker-id>/drain
```

Global drain for every worker using the default key:

```sql
INSERT INTO worker_runtime_config (config_key, config_value, updated_at)
VALUES ('worker-go', '{"drain": true}'::jsonb, now())
ON CONFLICT (config_key) DO UPDATE
SET config_value = EXCLUDED.config_value, updated_at = EXCLUDED.updated_at;
```

Expected behavior:

- New `image_job_items` are not claimed.
- Already running items continue their provider request and completion path.
- Leases and item heartbeats continue while the item is running.

## Resume

Resume a single worker:

```bash
curl -X POST /api/admin/ops/workers/<worker-id>/resume
```

Disable global drain:

```sql
INSERT INTO worker_runtime_config (config_key, config_value, updated_at)
VALUES ('worker-go', '{"drain": false}'::jsonb, now())
ON CONFLICT (config_key) DO UPDATE
SET config_value = EXCLUDED.config_value, updated_at = EXCLUDED.updated_at;
```

## Queue Summary

Use admin APIs for worker and item-level queue state:

```bash
curl /api/admin/ops/workers
curl /api/admin/ops/image/queue-summary
curl /api/admin/ops/image/running-items
```

The queue summary returns counts for `queued`, `running`, `succeeded`,
`failed`, `cancelled`, `dead_letter`, and `stale_running`.

Equivalent read-only SQL:

```sql
SELECT status, count(*) AS items
FROM image_job_items
GROUP BY status
ORDER BY status;
```

Running items:

```sql
SELECT id, job_id, locked_by, heartbeat_at, lease_expires_at, attempt_count
FROM image_job_items
WHERE status = 'running'
ORDER BY heartbeat_at ASC NULLS FIRST
LIMIT 100;
```

## Stuck Running Items

A running item is suspect when `lease_expires_at < now()` or heartbeat age is
larger than the worker heartbeat interval plus operational tolerance.

1. Check `worker_nodes.last_heartbeat_at` for the owning worker.
2. Check `worker-go` logs for item heartbeat failures.
3. Confirm the provider request is not still active before changing item state.
4. Prefer waiting for lease expiry and normal re-claim behavior.
5. Record any manual DB intervention in `runtime_ops_events`.

## Diagnostics

Inside the worker container:

```bash
wget -qO- http://127.0.0.1:7900/healthz
wget -qO- http://127.0.0.1:7900/readyz
wget -qO- http://127.0.0.1:7900/metrics
```

`/debug/pprof` is registered only when `GO_ENABLE_PPROF=true`. Keep it disabled
by default and never expose it through public nginx routes.

Required metrics include:

- `image_worker_claim_total`
- `image_worker_claim_empty_total`
- `image_worker_item_started_total`
- `image_worker_item_succeeded_total`
- `image_worker_item_failed_total`
- `image_worker_item_retried_total`
- `image_worker_running_items`
- `image_worker_queue_wait_seconds`
- `image_worker_render_duration_seconds`
- `image_worker_heartbeat_failed_total`

## Admin API

- `GET /api/admin/ops/workers`
- `POST /api/admin/ops/workers/{id}/drain`
- `POST /api/admin/ops/workers/{id}/resume`
- `GET /api/admin/ops/image/queue-summary`
- `GET /api/admin/ops/image/running-items`

The endpoints must write the same control-plane tables/events consumed by the
Go `workercontrol` package and must not bypass the runtime state machine.
