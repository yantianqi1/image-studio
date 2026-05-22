package config

import "testing"

func TestLoadReadsGCSStorageConfig(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/image_studio")
	t.Setenv("ASSET_STORAGE_BACKEND", "gcs")
	t.Setenv("ASSET_STORAGE_GCS_BUCKET", "image-studio-assets")
	t.Setenv("ASSET_STORAGE_GCS_PREFIX", "generated-assets")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}

	if cfg.StorageBackend != "gcs" {
		t.Fatalf("StorageBackend = %q, want gcs", cfg.StorageBackend)
	}
	if cfg.StorageGCSBucket != "image-studio-assets" {
		t.Fatalf("StorageGCSBucket = %q", cfg.StorageGCSBucket)
	}
	if cfg.StorageGCSPrefix != "generated-assets" {
		t.Fatalf("StorageGCSPrefix = %q", cfg.StorageGCSPrefix)
	}
}

func TestLoadReadsInternalServiceTokens(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/image_studio")
	t.Setenv("INTERNAL_SERVICE_TOKEN", "service-token")
	t.Setenv("INTERNAL_SERVICE_TOKEN_NEXT", "next-token")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}

	if cfg.InternalServiceToken != "service-token" {
		t.Fatalf("InternalServiceToken = %q", cfg.InternalServiceToken)
	}
	if cfg.InternalServiceTokenNext != "next-token" {
		t.Fatalf("InternalServiceTokenNext = %q", cfg.InternalServiceTokenNext)
	}
}
