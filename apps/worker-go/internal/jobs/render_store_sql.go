package jobs

const loadJobContextSQL = `
SELECT
  i.id, i.result_index,
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
  storage_path, mime_type, visibility, created_at
) VALUES ($1, $2, $3, '', $4, $5, now())
RETURNING id`

const updateAssetPathSQL = `
UPDATE assets
SET storage_path = $1
WHERE id = $2`

const insertImageJobResultSQL = `
INSERT INTO image_job_results (
  job_id, result_index, asset_id, asset_url, revised_prompt, provider_request_id
) VALUES ($1, $2, $3, $4, $5, $6)`

const markRenderSucceededSQL = `
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
RETURNING job_id`

const AggregateParentJobSQL = `
WITH counts AS (
  SELECT
    job_id,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status = 'running') AS running,
    COUNT(*) FILTER (WHERE status = 'succeeded') AS succeeded,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed,
    COALESCE(MAX(attempt_count), 0) AS max_attempt
  FROM image_job_items
  WHERE job_id = $1
  GROUP BY job_id
),
retry_error AS (
  SELECT error_code, error_message
  FROM image_job_items
  WHERE job_id = $1 AND status = 'queued' AND error_code IS NOT NULL
  ORDER BY result_index ASC
  LIMIT 1
),
failed_error AS (
  SELECT error_message
  FROM image_job_items
  WHERE job_id = $1 AND status = 'failed'
  ORDER BY result_index ASC
  LIMIT 1
)
UPDATE image_jobs j
SET status = CASE
      WHEN counts.running > 0 THEN 'running'
      WHEN counts.succeeded = counts.total THEN 'succeeded'
      WHEN counts.failed > 0 AND counts.succeeded + counts.failed = counts.total THEN 'failed'
      ELSE 'queued'
    END,
    attempt_count = counts.max_attempt,
    finished_at = CASE
      WHEN counts.succeeded = counts.total THEN now()
      WHEN counts.failed > 0 AND counts.succeeded + counts.failed = counts.total THEN now()
      ELSE NULL
    END,
    available_at = CASE
      WHEN counts.succeeded = counts.total THEN now()
      WHEN counts.failed > 0 AND counts.succeeded + counts.failed = counts.total THEN now()
      ELSE j.available_at
    END,
    error_code = CASE
      WHEN counts.failed > 0 AND counts.succeeded + counts.failed = counts.total THEN 'image_job_failed'
      WHEN counts.running = 0 AND retry_error.error_code IS NOT NULL THEN retry_error.error_code
      ELSE NULL
    END,
    error_message = CASE
      WHEN counts.failed > 0 AND counts.succeeded + counts.failed = counts.total THEN failed_error.error_message
      WHEN counts.running = 0 AND retry_error.error_code IS NOT NULL THEN retry_error.error_message
      ELSE NULL
    END
FROM counts
LEFT JOIN retry_error ON TRUE
LEFT JOIN failed_error ON TRUE
WHERE j.id = counts.job_id`
