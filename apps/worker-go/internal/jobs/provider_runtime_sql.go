package jobs

const recordProviderFailureSQL = `
WITH previous AS (
  SELECT provider_id, status AS previous_status
  FROM provider_runtime_state
  WHERE provider_id = $1
),
upserted AS (
  INSERT INTO provider_runtime_state (
    provider_id, status, failure_count, last_failure_at, circuit_open_until, updated_at
  ) VALUES (
    $1,
    CASE WHEN 1 >= $2 THEN 'circuit_open' ELSE 'degraded' END,
    1,
    now(),
    CASE WHEN 1 >= $2 THEN now() + ($3::int * interval '1 second') ELSE NULL END,
    now()
  )
  ON CONFLICT (provider_id) DO UPDATE
  SET failure_count=provider_runtime_state.failure_count + 1,
      last_failure_at=now(),
      status=CASE
        WHEN provider_runtime_state.failure_count + 1 >= $2 THEN 'circuit_open'
        ELSE 'degraded'
      END,
      circuit_open_until=CASE
        WHEN provider_runtime_state.failure_count + 1 >= $2 THEN now() + ($3::int * interval '1 second')
        ELSE provider_runtime_state.circuit_open_until
      END,
      updated_at=now()
  WHERE provider_runtime_state.status <> 'paused'
  RETURNING provider_id, status, failure_count, circuit_open_until
),
events AS (
  INSERT INTO outbox_events (
    aggregate_type, aggregate_id, event_type, payload, status, attempts, available_at, created_at
  )
  SELECT 'provider', upserted.provider_id::text, 'provider.circuit_opened',
    jsonb_build_object(
      'provider_id', upserted.provider_id,
      'status', upserted.status,
      'failure_count', upserted.failure_count,
      'circuit_open_until', upserted.circuit_open_until
    ),
    'pending', 0, now(), now()
  FROM upserted
  LEFT JOIN previous ON previous.provider_id = upserted.provider_id
  WHERE upserted.status = 'circuit_open'
    AND COALESCE(previous.previous_status, '') <> 'circuit_open'
  RETURNING id
)
SELECT provider_id FROM upserted`

const resetProviderSuccessSQL = `
WITH previous AS (
  SELECT provider_id, status AS previous_status
  FROM provider_runtime_state
  WHERE provider_id = $1
),
updated AS (
  UPDATE provider_runtime_state
  SET status=CASE
        WHEN status = 'paused' THEN 'paused'
        ELSE 'healthy'
      END,
      failure_count=0,
      last_failure_at=NULL,
      circuit_open_until=NULL,
      updated_at=now()
  WHERE provider_id=$1
  RETURNING provider_id, status
),
events AS (
  INSERT INTO outbox_events (
    aggregate_type, aggregate_id, event_type, payload, status, attempts, available_at, created_at
  )
  SELECT 'provider', updated.provider_id::text, 'provider.circuit_closed',
    jsonb_build_object('provider_id', updated.provider_id, 'status', updated.status),
    'pending', 0, now(), now()
  FROM updated
  JOIN previous ON previous.provider_id = updated.provider_id
  WHERE previous.previous_status = 'circuit_open'
    AND updated.status = 'healthy'
  RETURNING id
)
SELECT provider_id FROM updated`
