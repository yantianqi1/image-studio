package service

const resolveModelTargetSQL = `
SELECT m.provider_id, m.provider_model, p.type
FROM sellable_models m
JOIN providers p ON p.id = m.provider_id
WHERE m.code=$1
  AND m.capability='image'
  AND m.public_enabled = TRUE
  AND m.status='active'
  AND p.status='active'`

const insertPublicJobSQL = `
INSERT INTO image_jobs (
  user_id, anonymous_session_id, source, mode, title, prompt, model_code,
  source_asset_id, provider_id, provider_model, client_access_id,
  client_provider_config, conversation_messages, visibility, requested_count,
  attempt_count, max_attempts, status, size, quality, available_at, created_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7,
  $8, $9, $10, $11,
  $12::json, $13::json, $14, $15,
  0, 3, 'queued', $16, $17, now(), now()
)
RETURNING id`

const insertPublicItemSQL = `
INSERT INTO image_job_items (
  job_id, result_index, status, attempt_count, max_attempts, available_at, created_at
) VALUES ($1, $2, 'queued', 0, 3, now(), now())`

const insertPublicReferenceSQL = `
INSERT INTO image_job_reference_assets (job_id, asset_id, sequence, created_at)
VALUES ($1, $2, $3, now())`

const siteSettingsSQL = `
SELECT allow_anonymous_image, uploads_enabled, public_quota_mode,
  public_quota_daily_global_limit, public_quota_per_ip_limit
FROM site_settings
ORDER BY id ASC
LIMIT 1`

const insertDefaultSiteSettingsSQL = `
INSERT INTO site_settings (
  site_title, allow_public_signup, allow_anonymous_image, uploads_enabled,
  public_quota_mode, public_quota_daily_global_limit, public_quota_per_ip_limit,
  client_provider_url_pool, updated_at
) VALUES (
  'image Studio', TRUE, TRUE, TRUE,
  'daily_global', 20, 20,
  'https://ws.wdapi.top/v1
https://api.openai.com/v1', now()
)`

const insertAnonymousSessionSQL = `
INSERT INTO anonymous_sessions (token_hash, created_at)
VALUES ($1, now())
RETURNING id`

const publicCreateAssetSQL = `
SELECT id, visibility, owner_user_id, owner_anonymous_session_id
FROM assets
WHERE id=$1`

const accessibleCharacterSQL = `
SELECT id, asset_id, name
FROM character_library_entries
WHERE id = ANY($1)
  AND (visibility='public' OR owner_user_id=$2)`

const publicCharacterSQL = `
SELECT id, asset_id, name
FROM character_library_entries
WHERE id = ANY($1)
  AND visibility='public'`
