package main

import (
	"strings"
	"testing"
)

func TestParseScanFlagsRequiresExplicitMode(t *testing.T) {
	if _, err := parseScanFlags([]string{}); err == nil {
		t.Fatal("expected missing mode to fail")
	}
	if _, err := parseScanFlags([]string{"--dry-run", "--execute"}); err == nil {
		t.Fatal("expected conflicting modes to fail")
	}
}

func TestParseScanFlagsAcceptsDryRunAndExecute(t *testing.T) {
	dryRun, err := parseScanFlags([]string{"--dry-run"})
	if err != nil {
		t.Fatalf("parse dry-run failed: %v", err)
	}
	if dryRun.Execute {
		t.Fatal("dry-run parsed as execute")
	}
	execute, err := parseScanFlags([]string{"--execute"})
	if err != nil {
		t.Fatalf("parse execute failed: %v", err)
	}
	if !execute.Execute {
		t.Fatal("execute flag did not enable execution")
	}
}

func TestLoadConfigRequiresDatabaseURL(t *testing.T) {
	_, err := loadConfig(func(string) string { return "" })
	if err == nil || !strings.Contains(err.Error(), "DATABASE_URL") {
		t.Fatalf("expected DATABASE_URL error, got %v", err)
	}
}

func TestLoadConfigReadsStorageSettings(t *testing.T) {
	cfg, err := loadConfig(func(key string) string {
		values := map[string]string{
			"DATABASE_URL":             "postgres://example",
			"ASSET_STORAGE_BACKEND":    "gcs",
			"ASSET_STORAGE_GCS_BUCKET": "bucket",
			"ASSET_STORAGE_GCS_PREFIX": "prefix",
		}
		return values[key]
	})
	if err != nil {
		t.Fatalf("load config failed: %v", err)
	}
	if cfg.Storage.Backend != "gcs" || cfg.Storage.GCSBucket != "bucket" {
		t.Fatalf("unexpected storage config: %#v", cfg.Storage)
	}
}
