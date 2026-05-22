package jobs

const loadJobContextSQL = `
SELECT
  i.id, i.result_index, i.available_at,
  j.id, j.user_id, j.anonymous_session_id, j.client_access_id,
  j.prompt, COALESCE(j.provider_model, ''), j.requested_count,
  j.attempt_count, j.max_attempts, COALESCE(j.storage_subdir, ''),
  COALESCE(j.visibility, 'private'), COALESCE(j.size, ''),
  COALESCE(j.quality, ''), j.source_asset_id,
  j.conversation_messages::text, j.client_provider_config::text,
  p.id, p.name, p.type, COALESCE(p.base_url, ''),
  COALESCE(p.api_key_env, ''), COALESCE(p.default_model, ''), p.status
FROM image_jobs j
JOIN image_job_items i ON i.job_id = j.id
JOIN providers p ON p.id = j.provider_id
WHERE i.id = $1 AND i.locked_by = $2 AND i.status = 'running'`

const listReferenceAssetIDsSQL = `
SELECT asset_id
FROM image_job_reference_assets
WHERE job_id = $1
ORDER BY sequence ASC`

const loadAssetRefSQL = `
SELECT id, storage_path, mime_type
FROM assets
WHERE id = $1`

const loadAttemptStateSQL = `
SELECT attempt_count, max_attempts
FROM image_job_items
WHERE id = $1 AND locked_by = $2 AND status = 'running'`

const lockRunningJobSQL = `
SELECT job_id
FROM image_job_items
WHERE id = $1 AND locked_by = $2 AND status = 'running'
FOR UPDATE`

const lockCompletionItemSQL = `
SELECT status, COALESCE(locked_by, '')
FROM image_job_items
WHERE id = $1
FOR UPDATE`

const lockParentJobSQL = `
SELECT id
FROM image_jobs
WHERE id = $1
FOR UPDATE`

const listExistingOutputAssetsSQL = `
SELECT a.storage_path
FROM image_job_results r
JOIN assets a ON a.id = r.asset_id
WHERE r.job_id = $1 AND r.result_index = $2`

const deleteExistingOutputsSQL = `
WITH deleted_results AS (
  DELETE FROM image_job_results
  WHERE job_id = $1 AND result_index = $2
  RETURNING asset_id
)
DELETE FROM assets
WHERE id IN (SELECT asset_id FROM deleted_results)`

const insertAssetSQL = `
INSERT INTO assets (
  owner_user_id, owner_anonymous_session_id, owner_client_id,
  storage_path, mime_type, visibility, size_bytes, sha256,
  width, height, storage_backend, created_at
) VALUES ($1, $2, $3, '', $4, $5, $6, $7, $8, $9, $10, now())
RETURNING id`

const updateAssetPathSQL = `
UPDATE assets
SET storage_path = $1
WHERE id = $2`

const insertImageJobResultSQL = `
INSERT INTO image_job_results (
  job_id, result_index, asset_id, asset_url, revised_prompt, provider_request_id
) VALUES ($1, $2, $3, $4, $5, $6)`

const insertAssetCreatedOutboxSQL = `
INSERT INTO outbox_events (
  aggregate_type, aggregate_id, event_type, payload, status, attempts, available_at, created_at
) VALUES (
  'asset', $1::bigint::text, 'asset.created',
  jsonb_build_object(
    'asset_id', $1::bigint,
    'storage_path', $2::text,
    'size_bytes', $3::bigint,
    'sha256', $4::text,
    'width', $5::int,
    'height', $6::int,
    'storage_backend', $7::text
  ),
  'pending', 0, now(), now()
)`

const insertProviderUsageEventSQL = `
INSERT INTO image_provider_usage_events (
  job_id, item_id, provider_id, provider_name, provider_model,
  input_tokens, output_tokens, total_tokens,
  raw_provider_cost_cents, provider_fee_cents, internal_cost_cents,
  raw_payload, created_at
) VALUES (
  $1, $2, $3, $4, $5,
  $6, $7, $8,
  $9, $10, $11,
  $12::jsonb, now()
)`

const aggregateProviderUsageSQL = `
UPDATE image_jobs
SET provider_input_tokens = CASE
      WHEN $2::int IS NULL THEN provider_input_tokens
      ELSE COALESCE(provider_input_tokens, 0) + $2::int
    END,
    provider_output_tokens = CASE
      WHEN $3::int IS NULL THEN provider_output_tokens
      ELSE COALESCE(provider_output_tokens, 0) + $3::int
    END,
    provider_total_tokens = CASE
      WHEN $4::int IS NULL THEN provider_total_tokens
      ELSE COALESCE(provider_total_tokens, 0) + $4::int
    END,
    raw_provider_cost_cents = CASE
      WHEN $5::int IS NULL THEN raw_provider_cost_cents
      ELSE COALESCE(raw_provider_cost_cents, 0) + $5::int
    END,
    provider_fee_cents = CASE
      WHEN $6::int IS NULL THEN provider_fee_cents
      ELSE COALESCE(provider_fee_cents, 0) + $6::int
    END,
    internal_cost_cents = CASE
      WHEN $7::int IS NULL THEN internal_cost_cents
      ELSE COALESCE(internal_cost_cents, 0) + $7::int
    END,
    provider_usage = CASE
      WHEN $8::jsonb IS NULL THEN provider_usage
      ELSE jsonb_build_object(
        'results',
        COALESCE(provider_usage->'results', '[]'::jsonb) || jsonb_build_array($8::jsonb)
      )
    END
WHERE id = $1`

const markRenderSucceededSQL = `
WITH updated AS (
UPDATE image_job_items
SET status='succeeded',
    finished_at=now(),
    available_at=now(),
    asset_id=$3,
    error_code=NULL,
    error_message=NULL,
    locked_by=NULL,
    locked_at=NULL,
    heartbeat_at=NULL,
    lease_expires_at=NULL
WHERE id=$1 AND locked_by=$2 AND status='running'
RETURNING id, job_id
),
events AS (
  INSERT INTO image_job_events (job_id, item_id, event_type, payload, created_at)
  SELECT job_id, id, 'image_job_item.succeeded',
    jsonb_build_object('id', job_id, 'status', 'succeeded', 'item_id', id, 'asset_id', $3),
    now()
  FROM updated
  RETURNING job_id, event_type, payload
),
outbox AS (
  INSERT INTO outbox_events (
    aggregate_type, aggregate_id, event_type, payload, status, attempts, available_at, created_at
  )
  SELECT 'image_job', job_id::text, event_type, payload, 'pending', 0, now(), now()
  FROM events
  RETURNING id
)
SELECT job_id FROM updated`

const markAssetCommitFailedSQL = `
WITH updated AS (
UPDATE image_job_items
SET status='failed',
    finished_at=now(),
    available_at=now(),
    dead_letter_at=now(),
    asset_id=NULL,
    error_code='asset_commit_failed',
    error_message=$3,
    last_error_code='asset_commit_failed',
    last_error_message=$3,
    locked_by=NULL,
    locked_at=NULL,
    heartbeat_at=NULL,
    lease_expires_at=NULL
WHERE id=$1 AND asset_id=$2
RETURNING id, job_id
),
events AS (
  INSERT INTO image_job_events (job_id, item_id, event_type, payload, created_at)
  SELECT job_id, id, 'image_job_item.dead_lettered',
    jsonb_build_object('id', job_id, 'status', 'failed', 'item_id', id, 'error_code', 'asset_commit_failed', 'error_message', $3),
    now()
  FROM updated
  RETURNING job_id, event_type, payload
),
outbox AS (
  INSERT INTO outbox_events (
    aggregate_type, aggregate_id, event_type, payload, status, attempts, available_at, created_at
  )
  SELECT 'image_job', job_id::text, event_type, payload, 'pending', 0, now(), now()
  FROM events
  RETURNING id
)
SELECT job_id FROM updated`

const deleteAssetCommitResultSQL = `
DELETE FROM image_job_results
WHERE job_id=$1 AND result_index=$2 AND asset_id=$3`

const deleteAssetCommitAssetSQL = `
DELETE FROM assets
WHERE id=$1`
