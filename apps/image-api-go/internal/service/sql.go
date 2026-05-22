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
SELECT r.id, r.job_id, r.result_index, r.asset_id,
  concat('/api/public/image/assets/', r.asset_id) AS asset_url,
  concat('/api/public/image/assets/', r.asset_id, '/thumbnail') AS thumbnail_url,
  a.visibility, a.published_at, a.created_at, r.revised_prompt, r.provider_request_id
FROM image_job_results r
JOIN assets a ON a.id = r.asset_id
WHERE r.job_id=$1
ORDER BY r.result_index ASC`

const publicGalleryBaseSQL = `
SELECT a.id AS asset_id,
  concat('/api/public/image/assets/', a.id) AS asset_url,
  concat('/api/public/image/assets/', a.id, '/thumbnail') AS thumbnail_url,
  a.visibility, a.published_at, a.created_at,
  r.job_id, r.result_index, j.prompt, r.revised_prompt
FROM image_job_results r
JOIN image_jobs j ON j.id = r.job_id
JOIN assets a ON a.id = r.asset_id`

const publicGalleryWherePublicSQL = `
LEFT JOIN users u ON u.id = a.owner_user_id
WHERE a.visibility='public'
  AND (a.owner_user_id IS NULL OR u.status='active')
ORDER BY a.created_at DESC, r.id DESC`

const publicGalleryWhereUserSQL = `
WHERE a.owner_user_id=$1
ORDER BY a.created_at DESC, r.id DESC`

const publicGalleryWhereAnonymousSQL = `
WHERE a.owner_anonymous_session_id=$1
ORDER BY a.created_at DESC, r.id DESC`

const publicJobOutputAssetsSQL = `
SELECT DISTINCT a.id, a.storage_path
FROM image_job_results r
JOIN assets a ON a.id = r.asset_id
WHERE r.job_id=$1`

const clearJobReferencesSQL = `
DELETE FROM image_job_reference_assets
WHERE job_id=$1`

const clearJobResultsSQL = `
DELETE FROM image_job_results
WHERE job_id=$1`

const clearJobItemsSQL = `
DELETE FROM image_job_items
WHERE job_id=$1`

const deleteAssetsSQL = `
DELETE FROM assets
WHERE id = ANY($1)`

const deleteImageJobSQL = `
DELETE FROM image_jobs
WHERE id=$1`

const publicJobEventsSQL = `
SELECT id, job_id, item_id, event_type, payload::text, created_at
FROM image_job_events
WHERE job_id=$1 AND id>$2
ORDER BY id ASC
LIMIT $3`

const insertImageJobEventSQL = `
INSERT INTO image_job_events (job_id, item_id, event_type, payload, created_at)
VALUES ($1, $2, $3, $4::jsonb, now())
RETURNING id`

const insertOutboxEventSQL = `
INSERT INTO outbox_events (
  aggregate_type, aggregate_id, event_type, payload, status, attempts, available_at, created_at
) VALUES ($1, $2, $3, $4::jsonb, 'pending', 0, now(), now())`

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
SELECT id, storage_path, mime_type, thumbnail_storage_path
FROM assets
WHERE id=$1`

const updateAssetThumbnailPathSQL = `
UPDATE assets
SET thumbnail_storage_path=$2
WHERE id=$1`
