package jobs

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const HeartbeatSQL = `
UPDATE image_job_items
SET heartbeat_at = now(),
    lease_expires_at = now() + ($3::int * interval '1 second')
WHERE id = $1
  AND locked_by = $2
  AND status = 'running'`

const MarkSucceededSQL = `
UPDATE image_job_items
SET status='succeeded',
    finished_at=now(),
    available_at=now(),
    asset_id=NULL,
    error_code=NULL,
    error_message=NULL,
    locked_by=NULL,
    locked_at=NULL,
    heartbeat_at=NULL,
    lease_expires_at=NULL
WHERE id=$1 AND locked_by=$2
RETURNING job_id`

const MarkFailedSQL = `
UPDATE image_job_items
SET status='failed',
    finished_at=now(),
    available_at=now(),
    dead_letter_at=now(),
    error_code='go_worker_simulated_failure',
    error_message=$3,
    last_error_code='go_worker_simulated_failure',
    last_error_message=$3,
    locked_by=NULL,
    locked_at=NULL,
    heartbeat_at=NULL,
    lease_expires_at=NULL
WHERE id=$1 AND locked_by=$2
RETURNING job_id`

const MarkRetryableFailureSQL = `
UPDATE image_job_items
SET status='queued',
    finished_at=NULL,
    available_at=now() + ($4::int * interval '1 second'),
    dead_letter_at=NULL,
    error_code=$3,
    error_message=$5,
    last_error_code=$3,
    last_error_message=$5,
    locked_by=NULL,
    locked_at=NULL,
    heartbeat_at=NULL,
    lease_expires_at=NULL
WHERE id=$1 AND locked_by=$2 AND status='running'
RETURNING job_id`

const MarkTerminalFailureSQL = `
UPDATE image_job_items
SET status='failed',
    finished_at=now(),
    available_at=now(),
    dead_letter_at=now(),
    error_code=$3,
    error_message=$4,
    last_error_code=$3,
    last_error_message=$4,
    locked_by=NULL,
    locked_at=NULL,
    heartbeat_at=NULL,
    lease_expires_at=NULL
WHERE id=$1 AND locked_by=$2 AND status='running'
RETURNING job_id`

type PostgresStore struct {
	pool *pgxpool.Pool
}

type ClaimRequest struct {
	Limit                  int
	WorkerName             string
	LeaseSeconds           int
	OwnerConcurrency       int
	SupportedProviderTypes []string
}

type JobLock struct {
	ItemID     int64
	JobID      int64
	WorkerName string
}

type LeaseRequest struct {
	ItemID       int64
	WorkerName   string
	LeaseSeconds int
}

type FailRequest struct {
	ItemID     int64
	WorkerName string
	Message    string
}

type RenderFailureRequest struct {
	ItemID           int64
	WorkerName       string
	Error            error
	RetryBaseSeconds int
	RetryMaxSeconds  int
}

type RenderFailureResult struct {
	Updated bool
	Retried bool
}

func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{pool: pool}
}

func (s *PostgresStore) ClaimQueued(ctx context.Context, request ClaimRequest) ([]int64, error) {
	rows, err := s.queryClaimQueued(ctx, request)
	if err != nil {
		return nil, fmt.Errorf("claim queued image jobs: %w", err)
	}
	defer rows.Close()
	ids := make([]int64, 0, request.Limit)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan claimed image job item id: %w", err)
		}
		ids = append(ids, id)
	}
	if rows.Err() != nil {
		return nil, fmt.Errorf("iterate claimed image jobs: %w", rows.Err())
	}
	return ids, nil
}

func (s *PostgresStore) queryClaimQueued(ctx context.Context, request ClaimRequest) (pgx.Rows, error) {
	if len(request.SupportedProviderTypes) > 0 {
		return s.pool.Query(
			ctx, ClaimQueuedRenderSQL,
			request.Limit, request.WorkerName, request.LeaseSeconds,
			request.OwnerConcurrency, request.SupportedProviderTypes,
		)
	}
	return s.pool.Query(ctx, ClaimQueuedSQL, request.Limit, request.WorkerName, request.LeaseSeconds, request.OwnerConcurrency)
}

func (s *PostgresStore) Heartbeat(ctx context.Context, request LeaseRequest) (bool, error) {
	tag, err := s.pool.Exec(ctx, HeartbeatSQL, request.ItemID, request.WorkerName, request.LeaseSeconds)
	if err != nil {
		return false, fmt.Errorf("heartbeat image job item %d: %w", request.ItemID, err)
	}
	return tag.RowsAffected() > 0, nil
}

func (s *PostgresStore) MarkSucceeded(ctx context.Context, lock JobLock) (bool, error) {
	jobID, ok, err := s.updateItemAndAggregate(ctx, MarkSucceededSQL, lock.ItemID, lock.WorkerName)
	if err != nil {
		return false, fmt.Errorf("mark image job item %d succeeded: %w", lock.ItemID, err)
	}
	return ok, s.aggregateIfUpdated(ctx, ok, jobID)
}

func (s *PostgresStore) MarkFailed(ctx context.Context, request FailRequest) (bool, error) {
	jobID, ok, err := s.updateItemAndAggregate(ctx, MarkFailedSQL, request.ItemID, request.WorkerName, request.Message)
	if err != nil {
		return false, fmt.Errorf("mark image job item %d failed: %w", request.ItemID, err)
	}
	return ok, s.aggregateIfUpdated(ctx, ok, jobID)
}

func (s *PostgresStore) updateItemAndAggregate(ctx context.Context, sql string, args ...any) (int64, bool, error) {
	var jobID int64
	err := s.pool.QueryRow(ctx, sql, args...).Scan(&jobID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	return jobID, true, nil
}

func (s *PostgresStore) aggregateIfUpdated(ctx context.Context, ok bool, jobID int64) error {
	if !ok {
		return nil
	}
	_, err := s.pool.Exec(ctx, AggregateParentJobSQL, jobID)
	return err
}
