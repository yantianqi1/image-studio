package jobs

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/provider"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/storage"
)

type renderCompletionState struct {
	request   CompleteRenderRequest
	newKeys   []string
	oldKeys   []string
	committed bool
}

func (s *renderCompletionState) rollback(ctx context.Context, tx pgx.Tx) {
	if s.committed {
		return
	}
	_ = tx.Rollback(ctx)
	for _, key := range s.newKeys {
		_ = s.request.Storage.Delete(key)
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
	assetID, err := insertAssetRow(ctx, tx, s.request.Job, rendered)
	if err != nil {
		return 0, err
	}
	key, err := storage.RenderedAssetKey(assetID, rendered.MimeType, s.request.Job.StorageSubdir)
	if err != nil {
		return 0, err
	}
	if err := writeRenderedFile(s.request.Storage, key, rendered); err != nil {
		return 0, err
	}
	s.newKeys = append(s.newKeys, key)
	return assetID, insertResultRows(ctx, tx, s.request.Job.ID, index, assetID, key, rendered)
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

func insertAssetRow(ctx context.Context, tx pgx.Tx, job *provider.JobContext, rendered *provider.RenderedImage) (int64, error) {
	var assetID int64
	err := tx.QueryRow(
		ctx, insertAssetSQL,
		job.UserID, job.AnonymousSessionID, job.ClientAccessID,
		rendered.MimeType, job.Visibility,
	).Scan(&assetID)
	if err != nil {
		return 0, fmt.Errorf("insert rendered asset: %w", err)
	}
	return assetID, nil
}

func writeRenderedFile(store storage.AssetStorage, key string, rendered *provider.RenderedImage) error {
	if len(rendered.Content) == 0 {
		return provider.NewError("provider_response_invalid", "rendered image content empty", false)
	}
	if err := store.WriteBytes(key, rendered.Content, rendered.MimeType); err != nil {
		return fmt.Errorf("write rendered asset file: %w", err)
	}
	return nil
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
