package assetops

import (
	"context"
	"slices"
	"testing"
)

func TestScanOrphansKeepsReferencedThumbnails(t *testing.T) {
	store := &fakeAssetStore{
		referenced: map[string]struct{}{
			"asset-1.png":              {},
			"asset-1.thumb.jpg":        {},
			"nested/asset-2.webp":      {},
			"nested/asset-2.thumb.jpg": {},
		},
	}
	storage := newMemoryStorage(map[string][]byte{
		"asset-1.png":              []byte("image"),
		"asset-1.thumb.jpg":        []byte("thumb"),
		"nested/asset-2.webp":      []byte("image"),
		"nested/asset-2.thumb.jpg": []byte("thumb"),
		"asset-99.png":             []byte("orphan"),
	})

	summary, err := ScanOrphans(context.Background(), OrphanScanRequest{
		Storage: storage, Store: store, Execute: true,
	})
	if err != nil {
		t.Fatalf("scan orphans failed: %v", err)
	}
	if summary.Orphaned != 1 || summary.Deleted != 1 {
		t.Fatalf("summary = %#v, want one deleted orphan", summary)
	}
	if !storage.Exists("asset-1.thumb.jpg") {
		t.Fatal("referenced thumbnail was deleted as an orphan")
	}
	if storage.Exists("asset-99.png") {
		t.Fatal("orphan asset still exists after execute")
	}
}

func TestScanOrphansDryRunDoesNotDelete(t *testing.T) {
	storage := newMemoryStorage(map[string][]byte{"asset-99.png": []byte("orphan")})
	store := &fakeAssetStore{referenced: map[string]struct{}{}}

	summary, err := ScanOrphans(context.Background(), OrphanScanRequest{
		Storage: storage, Store: store,
	})
	if err != nil {
		t.Fatalf("scan orphans failed: %v", err)
	}
	if summary.Orphaned != 1 || summary.Deleted != 0 {
		t.Fatalf("summary = %#v, want dry-run orphan without delete", summary)
	}
	if !storage.Exists("asset-99.png") {
		t.Fatal("dry-run deleted an orphan asset")
	}
}

func TestVerifyAssetsReportsMissingAndHashMismatch(t *testing.T) {
	store := &fakeAssetStore{assets: []AssetRecord{
		{ID: 1, StoragePath: "asset-1.png", SHA256: stringPtr("bad")},
		{ID: 2, StoragePath: "asset-2.png"},
	}}
	storage := newMemoryStorage(map[string][]byte{"asset-1.png": []byte("image")})

	summary, err := VerifyAssets(context.Background(), VerifyRequest{
		Storage: storage, Store: store, Limit: 1000,
	})
	if err != nil {
		t.Fatalf("verify assets failed: %v", err)
	}
	if summary.Checked != 2 || summary.Missing != 1 || summary.Mismatched != 1 {
		t.Fatalf("summary = %#v, want missing and hash mismatch", summary)
	}
	kinds := []string{summary.Issues[0].Kind, summary.Issues[1].Kind}
	slices.Sort(kinds)
	if !slices.Equal(kinds, []string{"hash_mismatch", "missing"}) {
		t.Fatalf("issue kinds = %#v", kinds)
	}
}

func TestRebuildMissingThumbnailsWritesFileAndUpdatesStore(t *testing.T) {
	imageBytes := tinyPNG(t)
	store := &fakeAssetStore{assets: []AssetRecord{
		{ID: 7, StoragePath: "asset-7.png", MimeType: "image/png"},
	}}
	storage := newMemoryStorage(map[string][]byte{"asset-7.png": imageBytes})

	summary, err := RebuildThumbnails(context.Background(), ThumbnailRebuildRequest{
		Storage: storage, Store: store, MissingOnly: true,
	})
	if err != nil {
		t.Fatalf("rebuild thumbnails failed: %v", err)
	}
	if summary.Checked != 1 || summary.Rebuilt != 1 || summary.Updated != 1 {
		t.Fatalf("summary = %#v, want one rebuilt thumbnail", summary)
	}
	if !storage.Exists("asset-7.thumb.jpg") {
		t.Fatal("thumbnail file was not written")
	}
	if got := store.updated[7]; got != "asset-7.thumb.jpg" {
		t.Fatalf("updated thumbnail path = %q", got)
	}
}
