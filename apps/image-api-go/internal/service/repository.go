package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
)

type Repository struct {
	pool    *pgxpool.Pool
	storage storage.AssetStorage
	config  RepositoryConfig
}

type RepositoryConfig struct {
	SessionSecret string
}

func NewRepository(pool *pgxpool.Pool, assetStorage storage.AssetStorage) *Repository {
	return NewRepositoryWithConfig(pool, assetStorage, RepositoryConfig{})
}

func NewRepositoryWithConfig(
	pool *pgxpool.Pool,
	assetStorage storage.AssetStorage,
	config RepositoryConfig,
) *Repository {
	if config.SessionSecret == "" {
		config.SessionSecret = "replace-me"
	}
	return &Repository{pool: pool, storage: assetStorage, config: config}
}

func (r *Repository) GetPublicJob(ctx context.Context, jobID int64, owner Owner) (*JobPayload, error) {
	row := r.pool.QueryRow(ctx, publicJobSQL(owner), publicJobArgs(jobID, owner)...)
	return scanJob(row)
}

func (r *Repository) GetPublicResults(ctx context.Context, jobID int64, owner Owner) ([]ResultPayload, error) {
	if _, err := r.GetPublicJob(ctx, jobID, owner); err != nil {
		return nil, err
	}
	rows, err := r.pool.Query(ctx, publicResultsSQL, jobID)
	if err != nil {
		return nil, fmt.Errorf("query image job results: %w", err)
	}
	defer rows.Close()
	results := []ResultPayload{}
	for rows.Next() {
		result, err := scanResult(rows)
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}
	return results, rows.Err()
}

func (r *Repository) GetAdminDebug(ctx context.Context, jobID int64) (*DebugPayload, error) {
	job, err := scanJob(r.pool.QueryRow(ctx, adminJobSQL, jobID))
	if err != nil {
		return nil, err
	}
	resultCount, err := r.resultCount(ctx, jobID)
	if err != nil {
		return nil, err
	}
	return &DebugPayload{JobID: jobID, Job: job, ResultCount: resultCount}, nil
}

func (r *Repository) CreateInternalJob(ctx context.Context, request CreateJobRequest) (*JobPayload, error) {
	if err := validateCreateRequest(request); err != nil {
		return nil, err
	}
	providerID, providerModel, err := r.resolveModel(ctx, request.ModelCode)
	if err != nil {
		return nil, err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin internal image job create: %w", err)
	}
	defer tx.Rollback(ctx)
	jobID, err := insertShadowJob(ctx, tx, request, providerID, providerModel)
	if err != nil {
		return nil, err
	}
	if err := insertShadowItems(ctx, tx, jobID, request.RequestedCount); err != nil {
		return nil, err
	}
	if err := insertShadowReferences(ctx, tx, jobID, request.ReferenceAssetIDs); err != nil {
		return nil, err
	}
	if err := recordCreatedEvent(ctx, tx, jobID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit internal image job create: %w", err)
	}
	return r.GetPublicJob(ctx, jobID, request.Owner)
}

func validateCreateRequest(request CreateJobRequest) error {
	if strings.TrimSpace(request.Prompt) == "" || strings.TrimSpace(request.ModelCode) == "" {
		return fmt.Errorf("%w: prompt and model_code are required", ErrInvalidInput)
	}
	if request.RequestedCount < 1 {
		return fmt.Errorf("%w: requested_count must be at least 1", ErrInvalidInput)
	}
	if request.Owner.UserID == nil && request.Owner.AnonymousSessionID == nil {
		return fmt.Errorf("%w: owner is required", ErrInvalidInput)
	}
	return nil
}

func (r *Repository) resolveModel(ctx context.Context, modelCode string) (int64, string, error) {
	var providerID int64
	var providerModel string
	err := r.pool.QueryRow(ctx, resolveModelSQL, modelCode).Scan(&providerID, &providerModel)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, "", fmt.Errorf("%w: invalid model", ErrInvalidInput)
	}
	if err != nil {
		return 0, "", fmt.Errorf("resolve sellable model: %w", err)
	}
	return providerID, providerModel, nil
}

func (r *Repository) resultCount(ctx context.Context, jobID int64) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM image_job_results WHERE job_id=$1`, jobID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count image job results: %w", err)
	}
	return count, nil
}

func publicJobArgs(jobID int64, owner Owner) []any {
	if owner.UserID != nil {
		return []any{jobID, *owner.UserID}
	}
	if owner.AnonymousSessionID != nil {
		return []any{jobID, *owner.AnonymousSessionID}
	}
	return []any{jobID}
}

func publicJobSQL(owner Owner) string {
	if owner.UserID != nil {
		return publicJobBaseSQL + " AND user_id=$2"
	}
	if owner.AnonymousSessionID != nil {
		return publicJobBaseSQL + " AND anonymous_session_id=$2"
	}
	return publicJobBaseSQL + " AND FALSE"
}

func insertShadowJob(
	ctx context.Context,
	tx pgx.Tx,
	request CreateJobRequest,
	providerID int64,
	providerModel string,
) (int64, error) {
	var jobID int64
	err := tx.QueryRow(ctx, insertShadowJobSQL, shadowJobArgs(request, providerID, providerModel)...).Scan(&jobID)
	if err != nil {
		return 0, fmt.Errorf("insert internal image job: %w", err)
	}
	return jobID, nil
}

func shadowJobArgs(request CreateJobRequest, providerID int64, providerModel string) []any {
	conversationJSON, _ := json.Marshal(request.ConversationMessages)
	clientProviderJSON, _ := json.Marshal(request.ClientProviderConfig)
	return []any{
		int64OrNil(request.Owner.UserID), int64OrNil(request.Owner.AnonymousSessionID), request.Prompt,
		request.ModelCode, providerID, providerModel, request.RequestedCount, request.Mode,
		int64OrNil(request.SourceAssetID), nullJSONString(conversationJSON), nullJSONString(clientProviderJSON),
		defaultString(request.Visibility, "private"), request.Size, request.Quality,
	}
}

func insertShadowItems(ctx context.Context, tx pgx.Tx, jobID int64, count int) error {
	for resultIndex := 1; resultIndex <= count; resultIndex++ {
		if _, err := tx.Exec(ctx, insertShadowItemSQL, jobID, resultIndex); err != nil {
			return fmt.Errorf("insert internal image job item: %w", err)
		}
	}
	return nil
}

func insertShadowReferences(ctx context.Context, tx pgx.Tx, jobID int64, assetIDs []int64) error {
	for index, assetID := range assetIDs {
		if _, err := tx.Exec(ctx, insertShadowReferenceSQL, jobID, assetID, index+1); err != nil {
			return fmt.Errorf("insert internal image job reference: %w", err)
		}
	}
	return nil
}

func nullJSONString(content []byte) any {
	if string(content) == "null" {
		return nil
	}
	return string(content)
}

func int64OrNil(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}

func defaultString(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
