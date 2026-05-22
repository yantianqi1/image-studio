package jobs

const AggregateParentJobSQL = `
WITH previous AS (
  SELECT id, status AS previous_status
  FROM image_jobs
  WHERE id = $1
),
counts AS (
  SELECT
    job_id,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status = 'running') AS running,
    COUNT(*) FILTER (WHERE status = 'succeeded') AS succeeded,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed,
    COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
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
),
updated AS (
  UPDATE image_jobs j
  SET status = CASE
        WHEN counts.running > 0 THEN 'running'
        WHEN counts.succeeded = counts.total THEN 'succeeded'
        WHEN counts.failed > 0 AND counts.succeeded + counts.failed = counts.total THEN 'failed'
        WHEN counts.cancelled > 0 AND counts.succeeded + counts.failed + counts.cancelled = counts.total THEN 'cancelled'
        ELSE 'queued'
      END,
      attempt_count = counts.max_attempt,
      finished_at = CASE
        WHEN counts.succeeded = counts.total THEN now()
        WHEN counts.failed > 0 AND counts.succeeded + counts.failed = counts.total THEN now()
        WHEN counts.cancelled > 0 AND counts.succeeded + counts.failed + counts.cancelled = counts.total THEN now()
        ELSE NULL
      END,
      available_at = CASE
        WHEN counts.succeeded = counts.total THEN now()
        WHEN counts.failed > 0 AND counts.succeeded + counts.failed = counts.total THEN now()
        WHEN counts.cancelled > 0 AND counts.succeeded + counts.failed + counts.cancelled = counts.total THEN now()
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
  WHERE j.id = counts.job_id
  RETURNING j.id, j.status
),
job_events AS (
  INSERT INTO image_job_events (job_id, item_id, event_type, payload, created_at)
  SELECT updated.id, NULL,
    CASE
      WHEN updated.status = 'running' THEN 'image_job.started'
      WHEN updated.status = 'succeeded' THEN 'image_job.succeeded'
      WHEN updated.status = 'failed' THEN 'image_job.failed'
      ELSE 'image_job.cancelled'
    END,
    jsonb_build_object('id', updated.id, 'status', updated.status),
    now()
  FROM updated
  JOIN previous ON previous.id = updated.id
  WHERE updated.status <> previous.previous_status
    AND updated.status IN ('running', 'succeeded', 'failed', 'cancelled')
  RETURNING job_id, event_type, payload
),
outbox AS (
  INSERT INTO outbox_events (
    aggregate_type, aggregate_id, event_type, payload, status, attempts, available_at, created_at
  )
  SELECT 'image_job', job_id::text, event_type, payload, 'pending', 0, now(), now()
  FROM job_events
  RETURNING id
)
SELECT id FROM updated`
