package assetops

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const listReferencedAssetKeysSQL = `
SELECT storage_path
FROM assets
WHERE storage_path <> '' AND deleted_at IS NULL
UNION
SELECT thumbnail_storage_path
FROM assets
WHERE thumbnail_storage_path IS NOT NULL AND thumbnail_storage_path <> '' AND deleted_at IS NULL`

const listAssetsSQL = `
SELECT id, storage_path, mime_type, size_bytes, sha256, thumbnail_storage_path
FROM assets
WHERE storage_path <> '' AND deleted_at IS NULL
ORDER BY id ASC
LIMIT $1`

const listThumbnailCandidatesSQL = `
SELECT id, storage_path, mime_type, size_bytes, sha256, thumbnail_storage_path
FROM assets
WHERE storage_path <> ''
  AND deleted_at IS NULL
  AND mime_type LIKE 'image/%'
  AND mime_type <> 'image/svg+xml'
ORDER BY id ASC`

const updateThumbnailStoragePathSQL = `
UPDATE assets
SET thumbnail_storage_path=$2
WHERE id=$1`

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) ListReferencedAssetKeys(ctx context.Context) (map[string]struct{}, error) {
	rows, err := r.pool.Query(ctx, listReferencedAssetKeysSQL)
	if err != nil {
		return nil, fmt.Errorf("query referenced asset keys: %w", err)
	}
	defer rows.Close()
	return scanKeySet(rows)
}

func (r *Repository) ListAssets(ctx context.Context, limit int) ([]AssetRecord, error) {
	rows, err := r.pool.Query(ctx, listAssetsSQL, normalizeLimit(limit))
	if err != nil {
		return nil, fmt.Errorf("query assets: %w", err)
	}
	defer rows.Close()
	return scanAssets(rows)
}

func (r *Repository) ListThumbnailCandidates(ctx context.Context) ([]AssetRecord, error) {
	rows, err := r.pool.Query(ctx, listThumbnailCandidatesSQL)
	if err != nil {
		return nil, fmt.Errorf("query thumbnail candidates: %w", err)
	}
	defer rows.Close()
	return scanAssets(rows)
}

func (r *Repository) UpdateThumbnailStoragePath(ctx context.Context, assetID int64, key string) error {
	if _, err := r.pool.Exec(ctx, updateThumbnailStoragePathSQL, assetID, key); err != nil {
		return fmt.Errorf("update thumbnail storage path: %w", err)
	}
	return nil
}

func scanKeySet(rows pgx.Rows) (map[string]struct{}, error) {
	keys := map[string]struct{}{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, fmt.Errorf("scan asset key: %w", err)
		}
		keys[key] = struct{}{}
	}
	return keys, rows.Err()
}

func scanAssets(rows pgx.Rows) ([]AssetRecord, error) {
	assets := []AssetRecord{}
	for rows.Next() {
		asset, err := scanAsset(rows)
		if err != nil {
			return nil, err
		}
		assets = append(assets, asset)
	}
	return assets, rows.Err()
}

func scanAsset(row pgx.Row) (AssetRecord, error) {
	var asset AssetRecord
	err := row.Scan(
		&asset.ID, &asset.StoragePath, &asset.MimeType,
		&asset.SizeBytes, &asset.SHA256, &asset.ThumbnailStoragePath,
	)
	if err != nil {
		return asset, fmt.Errorf("scan asset: %w", err)
	}
	return asset, nil
}

func normalizeLimit(limit int) int {
	if limit <= 0 {
		return 1000
	}
	return limit
}
