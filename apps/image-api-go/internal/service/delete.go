package service

import (
	"context"
	"fmt"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/assetops"
)

type jobOutputAsset struct {
	ID          int64
	StoragePath string
}

func (r *Repository) DeletePublicJob(ctx context.Context, jobID int64, owner Owner) (*DeleteJobPayload, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin public image job delete: %w", err)
	}
	defer tx.Rollback(ctx)
	if _, err := scanJob(tx.QueryRow(ctx, publicJobSQL(owner)+" FOR UPDATE", publicJobArgs(jobID, owner)...)); err != nil {
		return nil, err
	}
	assets, err := loadJobOutputAssets(ctx, tx, jobID)
	if err != nil {
		return nil, err
	}
	if err := deleteOutputObjects(r.storage, assets); err != nil {
		return nil, err
	}
	if err := deletePublicJobRows(ctx, tx, jobID, assetIDs(assets)); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit public image job delete: %w", err)
	}
	return &DeleteJobPayload{Deleted: true, ID: strconv.FormatInt(jobID, 10)}, nil
}

func loadJobOutputAssets(ctx context.Context, tx pgx.Tx, jobID int64) ([]jobOutputAsset, error) {
	rows, err := tx.Query(ctx, publicJobOutputAssetsSQL, jobID)
	if err != nil {
		return nil, fmt.Errorf("query public image job output assets: %w", err)
	}
	defer rows.Close()
	assets := []jobOutputAsset{}
	for rows.Next() {
		var asset jobOutputAsset
		if err := rows.Scan(&asset.ID, &asset.StoragePath); err != nil {
			return nil, fmt.Errorf("scan public image job output asset: %w", err)
		}
		assets = append(assets, asset)
	}
	return assets, rows.Err()
}

func deleteOutputObjects(storage assetDeleter, assets []jobOutputAsset) error {
	for _, asset := range assets {
		if err := storage.Delete(asset.StoragePath); err != nil {
			return fmt.Errorf("delete public image job asset %d: %w", asset.ID, err)
		}
		if err := storage.Delete(assetops.ThumbnailKey(asset.StoragePath)); err != nil {
			return fmt.Errorf("delete public image job thumbnail %d: %w", asset.ID, err)
		}
	}
	return nil
}

func deletePublicJobRows(ctx context.Context, tx pgx.Tx, jobID int64, assetIDs []int64) error {
	for _, statement := range []string{clearJobReferencesSQL, clearJobResultsSQL, clearJobItemsSQL} {
		if _, err := tx.Exec(ctx, statement, jobID); err != nil {
			return fmt.Errorf("delete public image job rows: %w", err)
		}
	}
	if err := deleteAssetRows(ctx, tx, assetIDs); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, deleteImageJobSQL, jobID); err != nil {
		return fmt.Errorf("delete public image job row: %w", err)
	}
	return nil
}

func deleteAssetRows(ctx context.Context, tx pgx.Tx, assetIDs []int64) error {
	if len(assetIDs) == 0 {
		return nil
	}
	if _, err := tx.Exec(ctx, deleteAssetsSQL, assetIDs); err != nil {
		return fmt.Errorf("delete public image job asset rows: %w", err)
	}
	return nil
}

func assetIDs(assets []jobOutputAsset) []int64 {
	ids := make([]int64, 0, len(assets))
	for _, asset := range assets {
		ids = append(ids, asset.ID)
	}
	return ids
}

type assetDeleter interface {
	Delete(string) error
}
