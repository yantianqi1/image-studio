package jobs

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/imagejob"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/provider"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
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
	alreadyDone, err := lockCompletingItem(ctx, tx, request.Lock)
	if err != nil {
		return err
	}
	if alreadyDone {
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit idempotent render completion transaction: %w", err)
		}
		state.txDone = true
		return nil
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
	if err := recordProviderUsage(ctx, tx, request.Job, request.Lock.ItemID, request.Results[0].Usage); err != nil {
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
	if err := resetProviderSuccessInTx(ctx, tx, request.Job); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit render completion transaction: %w", err)
	}
	state.txDone = true
	if failedAssetID, err := state.commitStagedFiles(); err != nil {
		return s.handleAssetCommitFailure(ctx, request, failedAssetID, err)
	}
	if err := s.recordAssetCreatedEvents(ctx, state.stagedResults); err != nil {
		return err
	}
	state.deleteOldFiles()
	return nil
}

func (s *PostgresStore) handleAssetCommitFailure(
	ctx context.Context,
	request CompleteRenderRequest,
	assetID int64,
	commitErr error,
) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("%w; begin asset commit failure transaction: %v", commitErr, err)
	}
	defer tx.Rollback(ctx)
	message := sanitizeFailureMessage(commitErr)
	if err := markAssetCommitFailed(ctx, tx, request.Lock, assetID, request.Job.ResultIndex, message); err != nil {
		return fmt.Errorf("%w; additionally failed to mark item failed: %v", commitErr, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("%w; additionally failed to commit item failure: %v", commitErr, err)
	}
	return commitErr
}

func (s *PostgresStore) HandleRenderFailure(ctx context.Context, request RenderFailureRequest) (RenderFailureResult, error) {
	attemptCount, maxAttempts, err := s.loadAttemptState(ctx, request.ItemID, request.WorkerName)
	if err != nil {
		return RenderFailureResult{}, err
	}
	message := sanitizeFailureMessage(request.Error)
	if provider.IsNonRetryable(request.Error) || attemptCount >= maxAttempts {
		updated, err := s.execTerminalFailure(ctx, request, message)
		return RenderFailureResult{Updated: updated}, err
	}
	updated, err := s.execRetryableFailure(ctx, request, message)
	return RenderFailureResult{Updated: updated, Retried: updated}, err
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
	jobID, ok, err := s.updateItemFailure(ctx, MarkTerminalFailureSQL, request, imagejob.TerminalErrorCode, message)
	if err != nil {
		return false, fmt.Errorf("mark image job item %d terminal failed: %w", request.ItemID, err)
	}
	if err := s.aggregateIfUpdated(ctx, ok, jobID); err != nil {
		return ok, err
	}
	return ok, s.recordProviderFailureIfUpdated(ctx, ok, request.ProviderCircuit)
}

func (s *PostgresStore) execRetryableFailure(ctx context.Context, request RenderFailureRequest, message string) (bool, error) {
	attemptCount, _, err := s.loadAttemptState(ctx, request.ItemID, request.WorkerName)
	if err != nil {
		return false, err
	}
	delay := imagejob.RetryBackoffSeconds(attemptCount, request.RetryBaseSeconds, request.RetryMaxSeconds)
	jobID, ok, err := s.updateItemFailure(ctx, MarkRetryableFailureSQL, request, imagejob.RetryErrorCode, delay, message)
	if err != nil {
		return false, fmt.Errorf("mark image job item %d retryable failed: %w", request.ItemID, err)
	}
	if err := s.aggregateIfUpdated(ctx, ok, jobID); err != nil {
		return ok, err
	}
	return ok, s.recordProviderFailureIfUpdated(ctx, ok, request.ProviderCircuit)
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

func (s *PostgresStore) recordProviderFailureIfUpdated(
	ctx context.Context,
	updated bool,
	request *ProviderCircuitRequest,
) error {
	if !updated || request == nil {
		return nil
	}
	_, err := s.pool.Exec(
		ctx,
		recordProviderFailureSQL,
		request.ProviderID,
		request.FailureThreshold,
		request.OpenSeconds,
	)
	if err != nil {
		return fmt.Errorf("record provider runtime failure: %w", err)
	}
	return nil
}

func resetProviderSuccessInTx(ctx context.Context, tx pgx.Tx, job *provider.JobContext) error {
	if job == nil || job.ClientProviderConfigRaw != "" || job.Provider.ID < 1 {
		return nil
	}
	if _, err := tx.Exec(ctx, resetProviderSuccessSQL, job.Provider.ID); err != nil {
		return fmt.Errorf("reset provider runtime state: %w", err)
	}
	return nil
}
