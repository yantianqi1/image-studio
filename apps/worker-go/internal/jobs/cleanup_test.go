package jobs

import (
	"context"
	"slices"
	"testing"
)

func TestCleanupOrphanAssetsDryRunDoesNotDelete(t *testing.T) {
	storage := &orphanCleanupStorage{keys: []string{"asset-1.png", "asset-2.png", "nested/asset-3.webp"}}
	store := staticAssetPathStore{paths: []string{"asset-1.png"}}

	summary, err := CleanupOrphanAssets(context.Background(), OrphanCleanupRequest{
		Storage: storage,
		Store:   store,
		Execute: false,
	})
	if err != nil {
		t.Fatalf("cleanup orphan assets failed: %v", err)
	}

	if summary.Scanned != 3 || summary.Referenced != 1 || summary.Orphaned != 2 || summary.Deleted != 0 {
		t.Fatalf("unexpected summary: %#v", summary)
	}
	if len(storage.deleted) != 0 {
		t.Fatalf("dry-run deleted keys: %#v", storage.deleted)
	}
}

func TestCleanupOrphanAssetsExecuteDeletesOnlyOrphans(t *testing.T) {
	storage := &orphanCleanupStorage{keys: []string{"asset-1.png", "asset-2.png", "nested/asset-3.webp"}}
	store := staticAssetPathStore{paths: []string{"asset-1.png"}}

	summary, err := CleanupOrphanAssets(context.Background(), OrphanCleanupRequest{
		Storage: storage,
		Store:   store,
		Execute: true,
	})
	if err != nil {
		t.Fatalf("cleanup orphan assets failed: %v", err)
	}

	slices.Sort(storage.deleted)
	wantDeleted := []string{"asset-2.png", "nested/asset-3.webp"}
	if !slices.Equal(storage.deleted, wantDeleted) {
		t.Fatalf("deleted keys = %#v, want %#v", storage.deleted, wantDeleted)
	}
	if summary.Deleted != len(wantDeleted) {
		t.Fatalf("deleted count = %d, want %d", summary.Deleted, len(wantDeleted))
	}
}

type orphanCleanupStorage struct {
	keys    []string
	deleted []string
}

func (s *orphanCleanupStorage) ListGeneratedAssetKeys() ([]string, error) {
	return slices.Clone(s.keys), nil
}

func (s *orphanCleanupStorage) Delete(key string) error {
	s.deleted = append(s.deleted, key)
	return nil
}

type staticAssetPathStore struct {
	paths []string
}

func (s staticAssetPathStore) ListAssetStoragePaths(context.Context) (map[string]struct{}, error) {
	result := make(map[string]struct{}, len(s.paths))
	for _, path := range s.paths {
		result[path] = struct{}{}
	}
	return result, nil
}
