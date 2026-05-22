package workercontrol

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type DB interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

type PostgresStore struct {
	db DB
}

func NewPostgresStore(db DB) *PostgresStore {
	return &PostgresStore{db: db}
}

func (s *PostgresStore) UpsertWorker(ctx context.Context, request RegisterWorkerRequest) (WorkerNode, error) {
	metadata, err := encodeJSON(request.Metadata)
	if err != nil {
		return WorkerNode{}, err
	}
	row := s.db.QueryRow(ctx, upsertWorkerSQL,
		request.ID, request.WorkerName, request.Hostname, request.Version,
		WorkerStatusRunning, request.Mode, request.Concurrency,
		request.Now, request.Now, metadata,
	)
	return scanWorker(row)
}

func (s *PostgresStore) UpdateHeartbeat(ctx context.Context, request HeartbeatRequest) (WorkerNode, error) {
	row := s.db.QueryRow(ctx, updateHeartbeatSQL, request.ID, request.Now)
	return scanWorker(row)
}

func (s *PostgresStore) UpdateStatus(ctx context.Context, request StatusRequest) (WorkerNode, error) {
	row := s.db.QueryRow(ctx, updateStatusSQL, request.ID, request.Status, request.Now)
	return scanWorker(row)
}

func (s *PostgresStore) GetWorker(ctx context.Context, id string) (WorkerNode, error) {
	return scanWorker(s.db.QueryRow(ctx, getWorkerSQL, id))
}

func (s *PostgresStore) ListWorkers(ctx context.Context) ([]WorkerNode, error) {
	rows, err := s.db.Query(ctx, listWorkersSQL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanWorkers(rows)
}

func (s *PostgresStore) LoadRuntimeConfigValue(ctx context.Context, key string) ([]byte, bool, error) {
	var raw []byte
	err := s.db.QueryRow(ctx, loadRuntimeConfigSQL, key).Scan(&raw)
	if err == nil {
		return raw, true, nil
	}
	if err == pgx.ErrNoRows {
		return nil, false, nil
	}
	return nil, false, err
}

func (s *PostgresStore) UpsertRuntimeConfig(ctx context.Context, record RuntimeConfigRecord) error {
	_, err := s.db.Exec(ctx, upsertRuntimeConfigSQL, record.ConfigKey, record.Value, record.UpdatedAt)
	return err
}

func (s *PostgresStore) InsertOpsEvent(ctx context.Context, event OpsEvent) error {
	payload, err := encodeJSON(event.Payload)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx, insertOpsEventSQL, event.EventType, event.TargetType, event.TargetID, payload, event.CreatedAt)
	return err
}

func scanWorkers(rows pgx.Rows) ([]WorkerNode, error) {
	workers := []WorkerNode{}
	for rows.Next() {
		worker, err := scanWorker(rows)
		if err != nil {
			return nil, err
		}
		workers = append(workers, worker)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}
	return workers, nil
}

type scanner interface {
	Scan(...any) error
}

func scanWorker(row scanner) (WorkerNode, error) {
	var node WorkerNode
	var metadata []byte
	err := row.Scan(
		&node.ID, &node.WorkerName, &node.Hostname, &node.Version,
		&node.Status, &node.Mode, &node.Concurrency, &node.StartedAt,
		&node.LastHeartbeatAt, &metadata,
	)
	if err != nil {
		return WorkerNode{}, err
	}
	node.Metadata, err = decodeMetadata(metadata)
	return node, err
}

func encodeJSON(value any) ([]byte, error) {
	if value == nil {
		return []byte("{}"), nil
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("encode json payload: %w", err)
	}
	return raw, nil
}

func decodeMetadata(raw []byte) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	var metadata map[string]any
	if err := json.Unmarshal(raw, &metadata); err != nil {
		return nil, fmt.Errorf("decode worker metadata: %w", err)
	}
	return metadata, nil
}
