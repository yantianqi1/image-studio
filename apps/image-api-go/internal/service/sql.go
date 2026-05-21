package service

const publicJobBaseSQL = `
SELECT id, user_id, source, mode, title, prompt, model_code, visibility,
  source_asset_id, provider_id, provider_model,
  client_provider_config ->> 'base_url' AS client_provider_base_url,
  status, requested_count, attempt_count, max_attempts, size, quality,
  provider_input_tokens, provider_output_tokens, provider_total_tokens,
  raw_provider_cost_cents, provider_fee_cents, internal_cost_cents,
  error_code, error_message, created_at, available_at, started_at, finished_at
FROM image_jobs
WHERE id=$1`

const adminJobSQL = publicJobBaseSQL

const publicResultsSQL = `
SELECT result_index, asset_id, asset_url
FROM image_job_results
WHERE job_id=$1
ORDER BY result_index ASC`

const resolveModelSQL = `
SELECT m.provider_id, m.provider_model
FROM sellable_models m
JOIN providers p ON p.id = m.provider_id
WHERE m.code=$1
  AND m.capability='image'
  AND m.public_enabled = TRUE
  AND m.status='active'
  AND p.status='active'`

const insertShadowJobSQL = `
INSERT INTO image_jobs (
  user_id, anonymous_session_id, source, mode, prompt, model_code,
  provider_id, provider_model, requested_count, attempt_count, max_attempts,
  status, source_asset_id, conversation_messages, client_provider_config,
  visibility, size, quality, created_at, available_at
) VALUES (
  $1, $2, 'go-shadow', $8, $3, $4,
  $5, $6, $7, 0, 3,
  'queued', $9, $10::json, $11::json,
  $12, $13, $14, now(), now()
)
RETURNING id`

const insertShadowItemSQL = `
INSERT INTO image_job_items (
  job_id, result_index, status, attempt_count, max_attempts, available_at, created_at
) VALUES ($1, $2, 'queued', 0, 3, now(), now())`

const insertShadowReferenceSQL = `
INSERT INTO image_job_reference_assets (job_id, asset_id, sequence, created_at)
VALUES ($1, $2, $3, now())`

const userOwnerSQL = `
SELECT u.id, u.status
FROM users u
JOIN user_sessions s ON s.user_id = u.id
WHERE s.token_hash = $1`

const anonymousOwnerSQL = `
SELECT id
FROM anonymous_sessions
WHERE token_hash = $1
  AND revoked_at IS NULL`

const publicAssetBaseSQL = `
SELECT id, storage_path, mime_type
FROM assets
WHERE id=$1`
