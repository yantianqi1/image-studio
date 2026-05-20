package storage

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRenderedAssetKeyMatchesPythonConvention(t *testing.T) {
	tests := []struct {
		name     string
		assetID  int64
		mimeType string
		subdir   string
		want     string
	}{
		{name: "png root", assetID: 42, mimeType: "image/png", want: "asset-42.png"},
		{name: "webp subdir", assetID: 7, mimeType: "image/webp", subdir: "comic/run-1", want: "comic/run-1/asset-7.webp"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := RenderedAssetKey(tt.assetID, tt.mimeType, tt.subdir)
			if err != nil {
				t.Fatalf("expected key, got error %v", err)
			}
			if got != tt.want {
				t.Fatalf("unexpected key %q, want %q", got, tt.want)
			}
		})
	}
}

func TestLocalAssetStorageWritesRelativeKeysOnly(t *testing.T) {
	root := t.TempDir()
	store := NewLocalAssetStorage(root)

	if err := store.WriteBytes("nested/asset-1.png", []byte("png"), "image/png"); err != nil {
		t.Fatalf("write bytes failed: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(root, "nested", "asset-1.png"))
	if err != nil {
		t.Fatalf("read written file failed: %v", err)
	}
	if string(content) != "png" {
		t.Fatalf("unexpected content %q", string(content))
	}
	if err := store.WriteBytes("../escape.png", []byte("bad"), "image/png"); err == nil {
		t.Fatal("expected traversal key to fail")
	}
}

func TestBuildAssetStorageRejectsGCS(t *testing.T) {
	_, err := BuildAssetStorage(Config{Backend: "gcs", GeneratedAssetsDir: t.TempDir()})

	if err == nil {
		t.Fatal("expected gcs backend to be unsupported")
	}
}
