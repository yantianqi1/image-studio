package jobs

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/provider"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
)

type renderCompletionState struct {
	request        CompleteRenderRequest
	stagedResults  []stagedRenderedResult
	oldKeys        []string
	txDone         bool
	filesCommitted bool
}

type stagedRenderedResult struct {
	assetID  int64
	temp     storage.TempObject
	finalKey string
	metadata renderedAssetMetadata
}

func (s *renderCompletionState) rollback(ctx context.Context, tx pgx.Tx) {
	if !s.txDone {
		_ = tx.Rollback(ctx)
	}
	if s.filesCommitted {
		return
	}
	for _, result := range s.stagedResults {
		_ = s.request.Storage.Delete(result.temp.Key)
	}
}

func (s *renderCompletionState) clearExistingOutputs(ctx context.Context, tx pgx.Tx) error {
	oldKeys, err := listExistingOutputKeys(ctx, tx, s.request.Job.ID, s.request.Job.ResultIndex)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, deleteExistingOutputsSQL, s.request.Job.ID, s.request.Job.ResultIndex); err != nil {
		return fmt.Errorf("delete previous render outputs: %w", err)
	}
	s.oldKeys = oldKeys
	return nil
}

func (s *renderCompletionState) insertRenderedResult(
	ctx context.Context,
	tx pgx.Tx,
	index int,
	rendered *provider.RenderedImage,
) (int64, error) {
	metadata, err := buildRenderedAssetMetadata(rendered, s.request.Storage)
	if err != nil {
		return 0, err
	}
	assetID, err := insertAssetRow(ctx, tx, insertAssetRowRequest{
		Job: s.request.Job, Rendered: rendered, Metadata: metadata,
	})
	if err != nil {
		return 0, err
	}
	key, err := storage.RenderedAssetKey(assetID, rendered.MimeType, s.request.Job.StorageSubdir)
	if err != nil {
		return 0, err
	}
	temp, err := writeRenderedTemp(s.request.Storage, rendered)
	if err != nil {
		return 0, err
	}
	s.stagedResults = append(s.stagedResults, stagedRenderedResult{
		assetID: assetID, temp: temp, finalKey: key, metadata: metadata,
	})
	return assetID, insertResultRows(ctx, tx, s.request.Job.ID, index, assetID, key, rendered)
}

func (s *renderCompletionState) commitStagedFiles() (int64, error) {
	for _, result := range s.stagedResults {
		if err := s.request.Storage.CommitTemp(result.temp, result.finalKey); err != nil {
			return result.assetID, fmt.Errorf("commit staged asset file: %w", err)
		}
	}
	s.filesCommitted = true
	return 0, nil
}

func (s *PostgresStore) recordAssetCreatedEvents(ctx context.Context, results []stagedRenderedResult) error {
	for _, result := range results {
		if _, err := s.pool.Exec(ctx, insertAssetCreatedOutboxSQL, assetCreatedOutboxArgs(result)...); err != nil {
			return fmt.Errorf("record asset created event: %w", err)
		}
	}
	return nil
}

func assetCreatedOutboxArgs(result stagedRenderedResult) []any {
	return []any{
		result.assetID,
		result.finalKey,
		result.metadata.SizeBytes,
		result.metadata.SHA256,
		intOrNil(result.metadata.Width),
		intOrNil(result.metadata.Height),
		result.metadata.StorageBackend,
	}
}

func (s *renderCompletionState) deleteOldFiles() {
	for _, key := range s.oldKeys {
		_ = s.request.Storage.Delete(key)
	}
}

func lockRunningJob(ctx context.Context, tx pgx.Tx, lock JobLock) error {
	var id int64
	err := tx.QueryRow(ctx, lockRunningJobSQL, lock.ItemID, lock.WorkerName).Scan(&id)
	if err != nil {
		return fmt.Errorf("lock running image job item: %w", err)
	}
	return nil
}

func lockParentJob(ctx context.Context, tx pgx.Tx, jobID int64) error {
	var id int64
	err := tx.QueryRow(ctx, lockParentJobSQL, jobID).Scan(&id)
	if err != nil {
		return fmt.Errorf("lock parent image job: %w", err)
	}
	return nil
}

func listExistingOutputKeys(ctx context.Context, tx pgx.Tx, jobID int64, resultIndex int) ([]string, error) {
	rows, err := tx.Query(ctx, listExistingOutputAssetsSQL, jobID, resultIndex)
	if err != nil {
		return nil, fmt.Errorf("list previous output assets: %w", err)
	}
	defer rows.Close()
	keys := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, fmt.Errorf("scan previous output asset key: %w", err)
		}
		keys = append(keys, key)
	}
	return keys, rows.Err()
}

type insertAssetRowRequest struct {
	Job      *provider.JobContext
	Rendered *provider.RenderedImage
	Metadata renderedAssetMetadata
}

func insertAssetRow(ctx context.Context, tx pgx.Tx, request insertAssetRowRequest) (int64, error) {
	var assetID int64
	err := tx.QueryRow(
		ctx, insertAssetSQL,
		request.Job.UserID, request.Job.AnonymousSessionID, request.Job.ClientAccessID,
		request.Rendered.MimeType, request.Job.Visibility,
		request.Metadata.SizeBytes, request.Metadata.SHA256,
		intOrNil(request.Metadata.Width), intOrNil(request.Metadata.Height),
		request.Metadata.StorageBackend,
	).Scan(&assetID)
	if err != nil {
		return 0, fmt.Errorf("insert rendered asset: %w", err)
	}
	return assetID, nil
}

func intOrNil(value *int) any {
	if value == nil {
		return nil
	}
	return *value
}

func writeRenderedTemp(store storage.AssetStorage, rendered *provider.RenderedImage) (storage.TempObject, error) {
	if len(rendered.Content) == 0 {
		return storage.TempObject{}, provider.NewError("provider_response_invalid", "rendered image content empty", false)
	}
	temp, err := store.WriteTemp(rendered.Content, rendered.MimeType)
	if err != nil {
		return storage.TempObject{}, fmt.Errorf("write rendered temp asset file: %w", err)
	}
	return temp, nil
}

func insertResultRows(
	ctx context.Context,
	tx pgx.Tx,
	jobID int64,
	index int,
	assetID int64,
	key string,
	rendered *provider.RenderedImage,
) error {
	if _, err := tx.Exec(ctx, updateAssetPathSQL, key, assetID); err != nil {
		return fmt.Errorf("update rendered asset path: %w", err)
	}
	assetURL := fmt.Sprintf("/api/public/image/assets/%d", assetID)
	_, err := tx.Exec(ctx, insertImageJobResultSQL, jobID, index, assetID, assetURL, rendered.RevisedPrompt, rendered.ProviderRequestID)
	if err != nil {
		return fmt.Errorf("insert image job result: %w", err)
	}
	return nil
}

func markRenderSucceeded(ctx context.Context, tx pgx.Tx, lock JobLock, assetID int64) error {
	var jobID int64
	err := tx.QueryRow(ctx, markRenderSucceededSQL, lock.ItemID, lock.WorkerName, assetID).Scan(&jobID)
	if err != nil {
		return fmt.Errorf("mark render succeeded: %w", err)
	}
	return nil
}

func aggregateParentJob(ctx context.Context, tx pgx.Tx, jobID int64) error {
	if _, err := tx.Exec(ctx, AggregateParentJobSQL, jobID); err != nil {
		return fmt.Errorf("aggregate parent image job: %w", err)
	}
	return nil
}

func lockCompletingItem(ctx context.Context, tx pgx.Tx, lock JobLock) (bool, error) {
	var status string
	var lockedBy string
	err := tx.QueryRow(ctx, lockCompletionItemSQL, lock.ItemID).Scan(&status, &lockedBy)
	if err != nil {
		return false, fmt.Errorf("lock completing image job item: %w", err)
	}
	if status == "succeeded" {
		return true, nil
	}
	if status != "running" || lockedBy != lock.WorkerName {
		return false, provider.NewError("image_job_not_running", "image job is not running under this worker lock", true)
	}
	return false, nil
}

func markAssetCommitFailed(ctx context.Context, tx pgx.Tx, lock JobLock, assetID int64, resultIndex int, message string) error {
	var jobID int64
	err := tx.QueryRow(ctx, markAssetCommitFailedSQL, lock.ItemID, assetID, message).Scan(&jobID)
	if err != nil {
		return fmt.Errorf("mark asset commit failed: %w", err)
	}
	if _, err := tx.Exec(ctx, deleteAssetCommitResultSQL, jobID, resultIndex, assetID); err != nil {
		return fmt.Errorf("delete asset commit result: %w", err)
	}
	if _, err := tx.Exec(ctx, deleteAssetCommitAssetSQL, assetID); err != nil {
		return fmt.Errorf("delete asset commit asset: %w", err)
	}
	if err := lockParentJob(ctx, tx, jobID); err != nil {
		return err
	}
	return aggregateParentJob(ctx, tx, jobID)
}
