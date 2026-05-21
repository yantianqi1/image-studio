package jobs

import (
	"context"
	"fmt"
)

type OrphanAssetStore interface {
	ListAssetStoragePaths(context.Context) (map[string]struct{}, error)
}

type OrphanAssetStorage interface {
	ListGeneratedAssetKeys() ([]string, error)
	Delete(string) error
}

type OrphanCleanupRequest struct {
	Storage OrphanAssetStorage
	Store   OrphanAssetStore
	Execute bool
}

type OrphanCleanupSummary struct {
	Scanned    int
	Referenced int
	Orphaned   int
	Deleted    int
}

func CleanupOrphanAssets(ctx context.Context, request OrphanCleanupRequest) (OrphanCleanupSummary, error) {
	if request.Storage == nil || request.Store == nil {
		return OrphanCleanupSummary{}, fmt.Errorf("orphan cleanup storage and store are required")
	}
	keys, err := request.Storage.ListGeneratedAssetKeys()
	if err != nil {
		return OrphanCleanupSummary{}, fmt.Errorf("list generated asset files: %w", err)
	}
	referenced, err := request.Store.ListAssetStoragePaths(ctx)
	if err != nil {
		return OrphanCleanupSummary{}, fmt.Errorf("list referenced asset paths: %w", err)
	}
	summary := OrphanCleanupSummary{Scanned: len(keys), Referenced: len(referenced)}
	for _, key := range keys {
		if _, ok := referenced[key]; ok {
			continue
		}
		summary.Orphaned++
		if !request.Execute {
			continue
		}
		if err := request.Storage.Delete(key); err != nil {
			return summary, fmt.Errorf("delete orphan asset %q: %w", key, err)
		}
		summary.Deleted++
	}
	return summary, nil
}
