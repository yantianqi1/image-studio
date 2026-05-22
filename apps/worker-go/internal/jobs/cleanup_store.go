package jobs

import (
	"context"
	"fmt"
)

const ListAssetStoragePathsSQL = `
SELECT storage_path
FROM assets
WHERE storage_path <> '' AND deleted_at IS NULL
UNION
SELECT thumbnail_storage_path
FROM assets
WHERE thumbnail_storage_path IS NOT NULL AND thumbnail_storage_path <> '' AND deleted_at IS NULL`

func (s *PostgresStore) ListAssetStoragePaths(ctx context.Context) (map[string]struct{}, error) {
	rows, err := s.pool.Query(ctx, ListAssetStoragePathsSQL)
	if err != nil {
		return nil, fmt.Errorf("query asset storage paths: %w", err)
	}
	defer rows.Close()
	paths := map[string]struct{}{}
	for rows.Next() {
		var storagePath string
		if err := rows.Scan(&storagePath); err != nil {
			return nil, fmt.Errorf("scan asset storage path: %w", err)
		}
		paths[storagePath] = struct{}{}
	}
	return paths, rows.Err()
}
