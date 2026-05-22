package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
)

const imageJobAggregateType = "image_job"

type imageJobEventRecord struct {
	JobID     int64
	ItemID    *int64
	EventType string
	Payload   map[string]any
}

func (r *Repository) GetPublicEvents(
	ctx context.Context,
	jobID int64,
	owner Owner,
	afterID int64,
	limit int,
) ([]JobEventPayload, error) {
	if _, err := r.GetPublicJob(ctx, jobID, owner); err != nil {
		return nil, err
	}
	rows, err := r.pool.Query(ctx, publicJobEventsSQL, jobID, afterID, limit)
	if err != nil {
		return nil, fmt.Errorf("query image job events: %w", err)
	}
	defer rows.Close()
	return scanJobEvents(rows)
}

func scanJobEvents(rows pgx.Rows) ([]JobEventPayload, error) {
	events := []JobEventPayload{}
	for rows.Next() {
		event, err := scanJobEvent(rows)
		if err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

func scanJobEvent(rows pgx.Rows) (JobEventPayload, error) {
	var event JobEventPayload
	var itemID sql.NullInt64
	var rawPayload string
	var createdAt time.Time
	if err := rows.Scan(&event.ID, &event.JobID, &itemID, &event.EventType, &rawPayload, &createdAt); err != nil {
		return event, fmt.Errorf("scan image job event: %w", err)
	}
	if err := json.Unmarshal([]byte(rawPayload), &event.Payload); err != nil {
		return event, fmt.Errorf("decode image job event payload: %w", err)
	}
	event.ItemID = nullInt64(itemID)
	event.CreatedAt = formatTime(createdAt)
	return event, nil
}

func recordImageJobEventTx(ctx context.Context, tx pgx.Tx, event imageJobEventRecord) error {
	payload, err := json.Marshal(event.Payload)
	if err != nil {
		return fmt.Errorf("serialize image job event payload: %w", err)
	}
	if err := insertImageJobEventTx(ctx, tx, event, string(payload)); err != nil {
		return err
	}
	return insertOutboxEventTx(ctx, tx, event, string(payload))
}

func insertImageJobEventTx(ctx context.Context, tx pgx.Tx, event imageJobEventRecord, payload string) error {
	var eventID int64
	err := tx.QueryRow(ctx, insertImageJobEventSQL, event.JobID, int64OrNil(event.ItemID), event.EventType, payload).Scan(&eventID)
	if err != nil {
		return fmt.Errorf("insert image job event: %w", err)
	}
	return nil
}

func insertOutboxEventTx(ctx context.Context, tx pgx.Tx, event imageJobEventRecord, payload string) error {
	_, err := tx.Exec(
		ctx,
		insertOutboxEventSQL,
		imageJobAggregateType,
		strconv.FormatInt(event.JobID, 10),
		event.EventType,
		payload,
	)
	if err != nil {
		return fmt.Errorf("insert image job outbox event: %w", err)
	}
	return nil
}
