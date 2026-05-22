package workercontrol

const workerColumns = `
id, worker_name, hostname, version, status, mode, concurrency,
started_at, last_heartbeat_at, metadata`

const upsertWorkerSQL = `
INSERT INTO worker_nodes (
  id, worker_name, hostname, version, status, mode, concurrency,
  started_at, last_heartbeat_at, metadata
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
ON CONFLICT (id) DO UPDATE SET
  worker_name = EXCLUDED.worker_name,
  hostname = EXCLUDED.hostname,
  version = EXCLUDED.version,
  status = EXCLUDED.status,
  mode = EXCLUDED.mode,
  concurrency = EXCLUDED.concurrency,
  started_at = EXCLUDED.started_at,
  last_heartbeat_at = EXCLUDED.last_heartbeat_at,
  metadata = EXCLUDED.metadata
RETURNING ` + workerColumns

const updateHeartbeatSQL = `
UPDATE worker_nodes
SET last_heartbeat_at = $2
WHERE id = $1
RETURNING ` + workerColumns

const updateStatusSQL = `
UPDATE worker_nodes
SET status = $2, last_heartbeat_at = $3
WHERE id = $1
RETURNING ` + workerColumns

const getWorkerSQL = `
SELECT ` + workerColumns + `
FROM worker_nodes
WHERE id = $1`

const listWorkersSQL = `
SELECT ` + workerColumns + `
FROM worker_nodes
ORDER BY last_heartbeat_at DESC, id ASC`

const loadRuntimeConfigSQL = `
SELECT config_value
FROM worker_runtime_config
WHERE config_key = $1`

const upsertRuntimeConfigSQL = `
INSERT INTO worker_runtime_config (config_key, config_value, updated_at)
VALUES ($1, $2::jsonb, $3)
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  updated_at = EXCLUDED.updated_at`

const insertOpsEventSQL = `
INSERT INTO runtime_ops_events (event_type, target_type, target_id, payload, created_at)
VALUES ($1, $2, $3, $4::jsonb, $5)`
