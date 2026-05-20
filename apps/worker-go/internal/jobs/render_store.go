package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/provider"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/storage"
)

const (
	retryErrorCode       = "image_job_retry_scheduled"
	terminalErrorCode    = "image_job_failed"
	defaultRetryDelaySec = 5
)

type CompleteRenderRequest struct {
	Lock    JobLock
	Job     *provider.JobContext
	Results []*provider.RenderedImage
	Storage storage.AssetStorage
}

func (s *PostgresStore) LoadJobContext(ctx context.Context, lock JobLock) (*provider.JobContext, error) {
	job, err := s.loadLockedJob(ctx, lock)
	if err != nil {
		return nil, err
	}
	if job.ProviderModel == "" {
		job.ProviderModel = job.Provider.DefaultModel
	}
	if err := s.loadJobAssets(ctx, job); err != nil {
		return nil, err
	}
	return job, nil
}

func (s *PostgresStore) CompleteRenderedJob(ctx context.Context, request CompleteRenderRequest) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin render completion transaction: %w", err)
	}
	state := renderCompletionState{request: request}
	defer state.rollback(ctx, tx)
	if err := lockRunningJob(ctx, tx, request.Lock); err != nil {
		return err
	}
	if err := state.clearExistingOutputs(ctx, tx); err != nil {
		return err
	}
	if len(request.Results) != 1 {
		return provider.NewError("image_job_item_result_invalid", "image job item must produce one result", true)
	}
	assetID, err := state.insertRenderedResult(ctx, tx, request.Job.ResultIndex, request.Results[0])
	if err != nil {
		return err
	}
	if err := markRenderSucceeded(ctx, tx, request.Lock, assetID); err != nil {
		return err
	}
	if err := lockParentJob(ctx, tx, request.Job.ID); err != nil {
		return err
	}
	if err := aggregateParentJob(ctx, tx, request.Job.ID); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit render completion transaction: %w", err)
	}
	state.committed = true
	state.deleteOldFiles()
	return nil
}

func (s *PostgresStore) HandleRenderFailure(ctx context.Context, request RenderFailureRequest) (bool, error) {
	attemptCount, maxAttempts, err := s.loadAttemptState(ctx, request.ItemID, request.WorkerName)
	if err != nil {
		return false, err
	}
	message := sanitizeFailureMessage(request.Error)
	if provider.IsNonRetryable(request.Error) || attemptCount >= maxAttempts {
		return s.execTerminalFailure(ctx, request, message)
	}
	return s.execRetryableFailure(ctx, request, message)
}

func (s *PostgresStore) loadLockedJob(ctx context.Context, lock JobLock) (*provider.JobContext, error) {
	row := s.pool.QueryRow(ctx, loadJobContextSQL, lock.ItemID, lock.WorkerName)
	job, raw, err := scanJobContext(row)
	if err != nil {
		return nil, err
	}
	if err := applyRawJSON(job, raw); err != nil {
		return nil, err
	}
	return job, nil
}

func (s *PostgresStore) loadJobAssets(ctx context.Context, job *provider.JobContext) error {
	refIDs, err := s.loadReferenceAssetIDs(ctx, job.ID)
	if err != nil {
		return err
	}
	if job.SourceAsset != nil {
		source, err := s.loadAssetRef(ctx, job.SourceAsset.ID)
		if err != nil {
			return err
		}
		job.SourceAsset = &source
	}
	job.ReferenceAssets, err = s.loadAssetRefs(ctx, refIDs)
	if err != nil {
		return err
	}
	job.ConversationAssets, err = s.loadAssetRefs(ctx, provider.CollectConversationAssetIDs(job.ConversationMessages))
	return err
}

func (s *PostgresStore) loadReferenceAssetIDs(ctx context.Context, jobID int64) ([]int64, error) {
	rows, err := s.pool.Query(ctx, listReferenceAssetIDsSQL, jobID)
	if err != nil {
		return nil, fmt.Errorf("list image job reference assets: %w", err)
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan reference asset id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (s *PostgresStore) loadAssetRefs(ctx context.Context, ids []int64) ([]provider.AssetRef, error) {
	uniqueIDs := uniqueIDs(ids)
	assets := make([]provider.AssetRef, 0, len(uniqueIDs))
	for _, id := range uniqueIDs {
		asset, err := s.loadAssetRef(ctx, id)
		if err != nil {
			return nil, err
		}
		assets = append(assets, asset)
	}
	return assets, nil
}

func (s *PostgresStore) loadAssetRef(ctx context.Context, assetID int64) (provider.AssetRef, error) {
	var asset provider.AssetRef
	err := s.pool.QueryRow(ctx, loadAssetRefSQL, assetID).Scan(&asset.ID, &asset.StoragePath, &asset.MimeType)
	if errors.Is(err, pgx.ErrNoRows) {
		return asset, provider.NewError("source_asset_not_found", "source asset not found", false)
	}
	if err != nil {
		return asset, fmt.Errorf("load asset %d: %w", assetID, err)
	}
	if !strings.HasPrefix(asset.MimeType, "image/") {
		return asset, provider.NewError("source_asset_invalid", "source asset is not an image", true)
	}
	return asset, nil
}

func (s *PostgresStore) loadAttemptState(ctx context.Context, itemID int64, workerName string) (int, int, error) {
	var attemptCount int
	var maxAttempts int
	err := s.pool.QueryRow(ctx, loadAttemptStateSQL, itemID, workerName).Scan(&attemptCount, &maxAttempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, 0, provider.NewError("image_job_not_running", "image job is not running", true)
	}
	if err != nil {
		return 0, 0, fmt.Errorf("load image job attempt state: %w", err)
	}
	return attemptCount, maxAttempts, nil
}

func (s *PostgresStore) execTerminalFailure(ctx context.Context, request RenderFailureRequest, message string) (bool, error) {
	jobID, ok, err := s.updateItemFailure(ctx, MarkTerminalFailureSQL, request, terminalErrorCode, message)
	if err != nil {
		return false, fmt.Errorf("mark image job item %d terminal failed: %w", request.ItemID, err)
	}
	return ok, s.aggregateIfUpdated(ctx, ok, jobID)
}

func (s *PostgresStore) execRetryableFailure(ctx context.Context, request RenderFailureRequest, message string) (bool, error) {
	delay := request.RetryDelaySeconds
	if delay < 1 {
		delay = defaultRetryDelaySec
	}
	jobID, ok, err := s.updateItemFailure(ctx, MarkRetryableFailureSQL, request, retryErrorCode, delay, message)
	if err != nil {
		return false, fmt.Errorf("mark image job item %d retryable failed: %w", request.ItemID, err)
	}
	return ok, s.aggregateIfUpdated(ctx, ok, jobID)
}

func (s *PostgresStore) updateItemFailure(
	ctx context.Context,
	sql string,
	request RenderFailureRequest,
	args ...any,
) (int64, bool, error) {
	queryArgs := append([]any{request.ItemID, request.WorkerName}, args...)
	return s.updateItemAndAggregate(ctx, sql, queryArgs...)
}

func applyRawJSON(job *provider.JobContext, raw rawJobContext) error {
	if raw.conversationMessages.Valid && raw.conversationMessages.String != "null" {
		if err := json.Unmarshal([]byte(raw.conversationMessages.String), &job.ConversationMessages); err != nil {
			return provider.WrapError("conversation_messages_invalid", "conversation messages invalid", true, err)
		}
	}
	if raw.clientProviderConfig.Valid && raw.clientProviderConfig.String != "null" {
		job.ClientProviderConfigRaw = raw.clientProviderConfig.String
	}
	return nil
}

func uniqueIDs(ids []int64) []int64 {
	seen := map[int64]bool{}
	result := make([]int64, 0, len(ids))
	for _, id := range ids {
		if id == 0 || seen[id] {
			continue
		}
		seen[id] = true
		result = append(result, id)
	}
	return result
}

type rawJobContext struct {
	conversationMessages pgtype.Text
	clientProviderConfig pgtype.Text
}
