package service

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

const timestampLayout = "2006-01-02T15:04:05.999999"

type jobDBRow struct {
	ID                    int64
	UserID                sql.NullInt64
	Source                string
	Mode                  string
	Title                 sql.NullString
	Prompt                string
	ModelCode             string
	Visibility            string
	SourceAssetID         sql.NullInt64
	ProviderID            sql.NullInt64
	ProviderModel         sql.NullString
	ClientProviderBaseURL sql.NullString
	Status                string
	RequestedCount        int
	AttemptCount          int
	MaxAttempts           int
	Size                  sql.NullString
	Quality               sql.NullString
	ProviderInputTokens   sql.NullInt64
	ProviderOutputTokens  sql.NullInt64
	ProviderTotalTokens   sql.NullInt64
	RawProviderCostCents  sql.NullInt64
	ProviderFeeCents      sql.NullInt64
	InternalCostCents     sql.NullInt64
	ErrorCode             sql.NullString
	ErrorMessage          sql.NullString
	CreatedAt             time.Time
	AvailableAt           time.Time
	StartedAt             sql.NullTime
	FinishedAt            sql.NullTime
}

type resultDBRow struct {
	ID                int64
	JobID             int64
	ResultIndex       int
	AssetID           int64
	AssetURL          string
	ThumbnailURL      string
	Visibility        string
	PublishedAt       sql.NullTime
	CreatedAt         time.Time
	RevisedPrompt     sql.NullString
	ProviderRequestID sql.NullString
}

type itemDBRow struct {
	ID               int64
	JobID            int64
	ResultIndex      int
	Status           string
	AssetID          sql.NullInt64
	ErrorCode        sql.NullString
	ErrorMessage     sql.NullString
	ManualRetryCount int
	CreatedAt        time.Time
	AvailableAt      time.Time
	StartedAt        sql.NullTime
	FinishedAt       sql.NullTime
	CancelledAt      sql.NullTime
}

func scanJob(row pgx.Row) (*JobPayload, error) {
	dbRow, err := scanJobDBRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan image job: %w", err)
	}
	return jobPayloadFromDBRow(dbRow), nil
}

func scanJobDBRow(row pgx.Row) (jobDBRow, error) {
	var dbRow jobDBRow
	err := row.Scan(
		&dbRow.ID, &dbRow.UserID, &dbRow.Source, &dbRow.Mode, &dbRow.Title,
		&dbRow.Prompt, &dbRow.ModelCode, &dbRow.Visibility, &dbRow.SourceAssetID,
		&dbRow.ProviderID, &dbRow.ProviderModel, &dbRow.ClientProviderBaseURL,
		&dbRow.Status, &dbRow.RequestedCount, &dbRow.AttemptCount, &dbRow.MaxAttempts,
		&dbRow.Size, &dbRow.Quality, &dbRow.ProviderInputTokens, &dbRow.ProviderOutputTokens,
		&dbRow.ProviderTotalTokens, &dbRow.RawProviderCostCents, &dbRow.ProviderFeeCents,
		&dbRow.InternalCostCents, &dbRow.ErrorCode, &dbRow.ErrorMessage,
		&dbRow.CreatedAt, &dbRow.AvailableAt, &dbRow.StartedAt, &dbRow.FinishedAt,
	)
	return dbRow, err
}

func jobPayloadFromDBRow(row jobDBRow) *JobPayload {
	return &JobPayload{
		ID: row.ID, UserID: nullInt64(row.UserID), Source: row.Source, Mode: row.Mode,
		Title: resolvedTitle(row.Title), Prompt: row.Prompt, ModelCode: row.ModelCode,
		Visibility: row.Visibility, SourceAssetID: nullInt64(row.SourceAssetID),
		ProviderID: nullInt64(row.ProviderID), ProviderModel: nullStringValue(row.ProviderModel),
		ClientProviderBaseURL: nullStringValue(row.ClientProviderBaseURL), Status: row.Status,
		RequestedCount: row.RequestedCount, AttemptCount: row.AttemptCount, MaxAttempts: row.MaxAttempts,
		Size: nullStringValue(row.Size), Quality: nullStringValue(row.Quality),
		ProviderInputTokens:  nullInt64(row.ProviderInputTokens),
		ProviderOutputTokens: nullInt64(row.ProviderOutputTokens),
		ProviderTotalTokens:  nullInt64(row.ProviderTotalTokens),
		RawProviderCostCents: nullInt64(row.RawProviderCostCents),
		ProviderFeeCents:     nullInt64(row.ProviderFeeCents),
		InternalCostCents:    nullInt64(row.InternalCostCents), ErrorCode: nullStringValue(row.ErrorCode),
		ErrorMessage: nullStringValue(row.ErrorMessage), CreatedAt: formatTime(row.CreatedAt),
		AvailableAt: formatTime(row.AvailableAt), StartedAt: nullTime(row.StartedAt),
		FinishedAt: nullTime(row.FinishedAt),
	}
}

func scanResult(rows pgx.Rows) (ResultPayload, error) {
	dbRow, err := scanResultDBRow(rows)
	if err != nil {
		return ResultPayload{}, fmt.Errorf("scan image job result: %w", err)
	}
	return resultPayloadFromDBRow(dbRow), nil
}

func scanResultDBRow(rows pgx.Rows) (resultDBRow, error) {
	var dbRow resultDBRow
	err := rows.Scan(
		&dbRow.ID, &dbRow.JobID, &dbRow.ResultIndex, &dbRow.AssetID, &dbRow.AssetURL,
		&dbRow.ThumbnailURL, &dbRow.Visibility, &dbRow.PublishedAt, &dbRow.CreatedAt,
		&dbRow.RevisedPrompt, &dbRow.ProviderRequestID,
	)
	return dbRow, err
}

func resultPayloadFromDBRow(row resultDBRow) ResultPayload {
	return ResultPayload{
		ID: row.ID, JobID: row.JobID, ResultIndex: row.ResultIndex, AssetID: row.AssetID,
		AssetURL: row.AssetURL, ThumbnailURL: row.ThumbnailURL, Visibility: row.Visibility,
		PublishedAt: nullTime(row.PublishedAt), CreatedAt: formatTime(row.CreatedAt),
		RevisedPrompt:     nullStringValue(row.RevisedPrompt),
		ProviderRequestID: nullStringValue(row.ProviderRequestID),
	}
}

func scanItem(rows pgx.Rows) (ItemPayload, error) {
	dbRow, err := scanItemDBRow(rows)
	if err != nil {
		return ItemPayload{}, fmt.Errorf("scan image job item: %w", err)
	}
	return itemPayloadFromDBRow(dbRow), nil
}

func scanItemDBRow(rows pgx.Rows) (itemDBRow, error) {
	var dbRow itemDBRow
	err := rows.Scan(
		&dbRow.ID, &dbRow.JobID, &dbRow.ResultIndex, &dbRow.Status, &dbRow.AssetID,
		&dbRow.ErrorCode, &dbRow.ErrorMessage, &dbRow.ManualRetryCount,
		&dbRow.CreatedAt, &dbRow.AvailableAt, &dbRow.StartedAt,
		&dbRow.FinishedAt, &dbRow.CancelledAt,
	)
	return dbRow, err
}

func itemPayloadFromDBRow(row itemDBRow) ItemPayload {
	return ItemPayload{
		ID: row.ID, JobID: row.JobID, ResultIndex: row.ResultIndex, Status: row.Status,
		AssetID: nullInt64(row.AssetID), ErrorCode: nullStringValue(row.ErrorCode),
		ErrorMessage: nullStringValue(row.ErrorMessage), ManualRetryCount: row.ManualRetryCount,
		CreatedAt: formatTime(row.CreatedAt), AvailableAt: formatTime(row.AvailableAt),
		StartedAt: nullTime(row.StartedAt), FinishedAt: nullTime(row.FinishedAt),
		CancelledAt: nullTime(row.CancelledAt),
	}
}

func resolvedTitle(value sql.NullString) *string {
	if value.Valid && value.String == pendingImageJobTitle {
		return nil
	}
	return nullStringValue(value)
}

func nullStringValue(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	result := value.String
	return &result
}

func nullInt64(value sql.NullInt64) *int64 {
	if !value.Valid {
		return nil
	}
	result := value.Int64
	return &result
}

func nullTime(value sql.NullTime) *string {
	if !value.Valid {
		return nil
	}
	result := formatTime(value.Time)
	return &result
}

func formatTime(value time.Time) string {
	return value.Format(timestampLayout)
}
