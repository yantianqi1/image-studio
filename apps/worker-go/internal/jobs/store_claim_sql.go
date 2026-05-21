package jobs

const claimQueuedSQLTail = `
claimed AS (
  UPDATE image_job_items
  SET
    status = 'running',
    attempt_count = attempt_count + 1,
    started_at = now(),
    finished_at = NULL,
    error_code = NULL,
    error_message = NULL,
    locked_by = $2,
    locked_at = now(),
    heartbeat_at = now(),
    lease_expires_at = now() + ($3::int * interval '1 second')
  FROM picked
  WHERE image_job_items.id = picked.id
  RETURNING image_job_items.id, image_job_items.job_id
),
parents AS (
  UPDATE image_jobs
  SET status = 'running',
      started_at = COALESCE(image_jobs.started_at, now()),
      finished_at = NULL,
      error_code = NULL,
      error_message = NULL
  WHERE image_jobs.id IN (SELECT job_id FROM claimed)
  RETURNING image_jobs.id
)
SELECT id FROM claimed`

const ClaimQueuedSQL = `
WITH candidates AS (
  SELECT
    i.id,
    i.priority,
    i.available_at,
    CASE
      WHEN j.user_id IS NOT NULL THEN 'user:' || j.user_id::text
      WHEN j.anonymous_session_id IS NOT NULL THEN 'anonymous:' || j.anonymous_session_id::text
      ELSE NULL
    END AS owner_key,
    COALESCE(owner_running.running_count, 0) AS owner_running_count
  FROM image_job_items i
  JOIN image_jobs j ON j.id = i.job_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS running_count
    FROM image_job_items ri
    JOIN image_jobs rj ON rj.id = ri.job_id
    WHERE ri.status = 'running'
      AND (
        (j.user_id IS NOT NULL AND rj.user_id = j.user_id)
        OR (
          j.user_id IS NULL
          AND j.anonymous_session_id IS NOT NULL
          AND rj.anonymous_session_id = j.anonymous_session_id
        )
      )
  ) owner_running ON TRUE
  WHERE i.status = 'queued'
    AND i.available_at <= now()
    AND i.dead_letter_at IS NULL
    AND j.status IN ('queued', 'running')
),
ranked AS (
  SELECT
    id,
    priority,
    available_at,
    owner_key,
    owner_running_count,
    ROW_NUMBER() OVER (PARTITION BY owner_key ORDER BY priority DESC, available_at ASC, id ASC) AS owner_queue_rank
  FROM candidates
  WHERE owner_key IS NULL OR owner_running_count < $4::int
),
picked AS (
  SELECT i.id
  FROM image_job_items i
  JOIN ranked r ON r.id = i.id
  WHERE r.owner_key IS NULL
    OR r.owner_queue_rank <= GREATEST($4::int - owner_running_count, 0)
  ORDER BY r.priority DESC, r.available_at ASC, r.id ASC
  FOR UPDATE OF i SKIP LOCKED
  LIMIT $1
),
` + claimQueuedSQLTail

const ClaimQueuedRenderSQL = `
WITH candidates AS (
  SELECT
    i.id,
    i.priority,
    i.available_at,
    CASE
      WHEN j.user_id IS NOT NULL THEN 'user:' || j.user_id::text
      WHEN j.anonymous_session_id IS NOT NULL THEN 'anonymous:' || j.anonymous_session_id::text
      ELSE NULL
    END AS owner_key,
    COALESCE(owner_running.running_count, 0) AS owner_running_count
  FROM image_job_items i
  JOIN image_jobs j ON j.id = i.job_id
  JOIN providers p ON p.id = j.provider_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS running_count
    FROM image_job_items ri
    JOIN image_jobs rj ON rj.id = ri.job_id
    WHERE ri.status = 'running'
      AND (
        (j.user_id IS NOT NULL AND rj.user_id = j.user_id)
        OR (
          j.user_id IS NULL
          AND j.anonymous_session_id IS NOT NULL
          AND rj.anonymous_session_id = j.anonymous_session_id
        )
      )
  ) owner_running ON TRUE
  WHERE i.status = 'queued'
    AND i.available_at <= now()
    AND i.dead_letter_at IS NULL
    AND j.status IN ('queued', 'running')
    AND p.type = ANY($5::text[])
),
ranked AS (
  SELECT
    id,
    priority,
    available_at,
    owner_key,
    owner_running_count,
    ROW_NUMBER() OVER (PARTITION BY owner_key ORDER BY priority DESC, available_at ASC, id ASC) AS owner_queue_rank
  FROM candidates
  WHERE owner_key IS NULL OR owner_running_count < $4::int
),
picked AS (
  SELECT i.id
  FROM image_job_items i
  JOIN ranked r ON r.id = i.id
  WHERE r.owner_key IS NULL
    OR r.owner_queue_rank <= GREATEST($4::int - owner_running_count, 0)
  ORDER BY r.priority DESC, r.available_at ASC, r.id ASC
  FOR UPDATE OF i SKIP LOCKED
  LIMIT $1
),
` + claimQueuedSQLTail
