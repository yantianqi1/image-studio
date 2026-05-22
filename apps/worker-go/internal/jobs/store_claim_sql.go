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
previous_parents AS (
  SELECT id, status AS previous_status
  FROM image_jobs
  WHERE id IN (SELECT job_id FROM claimed)
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
),
item_events AS (
  INSERT INTO image_job_events (job_id, item_id, event_type, payload, created_at)
  SELECT job_id, id, 'image_job_item.started',
    jsonb_build_object('id', job_id, 'status', 'running', 'item_id', id),
    now()
  FROM claimed
  RETURNING job_id, event_type, payload
),
job_events AS (
  INSERT INTO image_job_events (job_id, item_id, event_type, payload, created_at)
  SELECT parents.id, NULL, 'image_job.started',
    jsonb_build_object('id', parents.id, 'status', 'running'),
    now()
  FROM parents
  JOIN previous_parents ON previous_parents.id = parents.id
  WHERE previous_parents.previous_status <> 'running'
  RETURNING job_id, event_type, payload
),
outbox_item_events AS (
  INSERT INTO outbox_events (
    aggregate_type, aggregate_id, event_type, payload, status, attempts, available_at, created_at
  )
  SELECT 'image_job', job_id::text, event_type, payload, 'pending', 0, now(), now()
  FROM item_events
  RETURNING id
),
outbox_job_events AS (
  INSERT INTO outbox_events (
    aggregate_type, aggregate_id, event_type, payload, status, attempts, available_at, created_at
  )
  SELECT 'image_job', job_id::text, event_type, payload, 'pending', 0, now(), now()
  FROM job_events
  RETURNING id
)
SELECT id FROM claimed`

const recoverExpiredLeasesSQL = `
expired_leases AS (
  UPDATE image_job_items
  SET
    status='queued',
    available_at=now(),
    error_code='worker_lease_expired',
    error_message='worker lease expired before heartbeat',
    locked_by=NULL,
    locked_at=NULL,
    heartbeat_at=NULL,
    lease_expires_at=NULL
  WHERE status = 'running'
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at <= now()
    AND dead_letter_at IS NULL
    AND cancelled_at IS NULL
  RETURNING id
),
`

const ClaimQueuedSQL = `
WITH ` + recoverExpiredLeasesSQL + `candidates AS (
  SELECT
    i.id,
    i.priority,
    i.scheduler_score,
    i.available_at,
    CASE
      WHEN j.user_id IS NOT NULL THEN 'user:' || j.user_id::text
      WHEN j.anonymous_session_id IS NOT NULL THEN 'anonymous:' || j.anonymous_session_id::text
      ELSE NULL
    END AS owner_key,
    CASE
      WHEN j.anonymous_session_id IS NOT NULL AND j.user_id IS NULL THEN $5::int
      ELSE $4::int
    END AS owner_limit,
    COALESCE(owner_running.running_count, 0) AS owner_running_count
  FROM image_job_items i
  JOIN image_jobs j ON j.id = i.job_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS running_count
    FROM image_job_items ri
    JOIN image_jobs rj ON rj.id = ri.job_id
    WHERE ri.status = 'running'
      AND ri.lease_expires_at > now()
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
    AND i.cancelled_at IS NULL
    AND j.status IN ('queued', 'running')
),
ranked AS (
  SELECT
    id,
    priority,
    scheduler_score,
    available_at,
    owner_key,
    owner_limit,
    owner_running_count,
    ROW_NUMBER() OVER (
      PARTITION BY owner_key
      ORDER BY priority DESC, scheduler_score DESC, available_at ASC, id ASC
    ) AS owner_queue_rank
  FROM candidates
  WHERE owner_key IS NULL OR owner_running_count < owner_limit
),
picked AS (
  SELECT i.id
  FROM image_job_items i
  JOIN ranked r ON r.id = i.id
  WHERE r.owner_key IS NULL
    OR r.owner_queue_rank <= GREATEST(owner_limit - owner_running_count, 0)
  ORDER BY r.priority DESC, r.scheduler_score DESC, r.available_at ASC, r.id ASC
  FOR UPDATE OF i SKIP LOCKED
  LIMIT $1
),
` + claimQueuedSQLTail

const ClaimQueuedRenderSQL = `
WITH ` + recoverExpiredLeasesSQL + `candidates AS (
  SELECT
    i.id,
    i.priority,
    i.scheduler_score,
    i.available_at,
    CASE
      WHEN j.user_id IS NOT NULL THEN 'user:' || j.user_id::text
      WHEN j.anonymous_session_id IS NOT NULL THEN 'anonymous:' || j.anonymous_session_id::text
      ELSE NULL
    END AS owner_key,
    CASE
      WHEN j.anonymous_session_id IS NOT NULL AND j.user_id IS NULL THEN $5::int
      ELSE $4::int
    END AS owner_limit,
    COALESCE(owner_running.running_count, 0) AS owner_running_count
  FROM image_job_items i
  JOIN image_jobs j ON j.id = i.job_id
  JOIN providers p ON p.id = j.provider_id
  LEFT JOIN provider_runtime_state prs ON prs.provider_id = p.id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS running_count
    FROM image_job_items ri
    JOIN image_jobs rj ON rj.id = ri.job_id
    WHERE ri.status = 'running'
      AND ri.lease_expires_at > now()
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
    AND i.cancelled_at IS NULL
    AND j.status IN ('queued', 'running')
    AND p.type = ANY($6::text[])
    AND COALESCE(prs.status, 'healthy') <> 'paused'
    AND (
      COALESCE(prs.status, 'healthy') <> 'circuit_open'
      OR prs.circuit_open_until IS NULL
      OR prs.circuit_open_until <= now()
    )
),
ranked AS (
  SELECT
    id,
    priority,
    scheduler_score,
    available_at,
    owner_key,
    owner_limit,
    owner_running_count,
    ROW_NUMBER() OVER (
      PARTITION BY owner_key
      ORDER BY priority DESC, scheduler_score DESC, available_at ASC, id ASC
    ) AS owner_queue_rank
  FROM candidates
  WHERE owner_key IS NULL OR owner_running_count < owner_limit
),
picked AS (
  SELECT i.id
  FROM image_job_items i
  JOIN ranked r ON r.id = i.id
  WHERE r.owner_key IS NULL
    OR r.owner_queue_rank <= GREATEST(owner_limit - owner_running_count, 0)
  ORDER BY r.priority DESC, r.scheduler_score DESC, r.available_at ASC, r.id ASC
  FOR UPDATE OF i SKIP LOCKED
  LIMIT $1
),
` + claimQueuedSQLTail
