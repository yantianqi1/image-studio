package main

import (
	"log/slog"
	"testing"

	"github.com/yantianqi1/image-studio/apps/worker-go/internal/config"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/jobs"
)

func TestValidateStartupRejectsSQLiteRenderMode(t *testing.T) {
	cfg := config.Config{
		DatabaseURL:         "sqlite:///tmp/test.db",
		Mode:                jobs.ModeRender,
		AssetStorageBackend: "local",
		Concurrency:         2,
	}

	err := validateStartupConfig(cfg, mapLookup(nil), slog.Default())

	if err == nil {
		t.Fatal("expected sqlite render startup to fail")
	}
}

func TestValidateStartupAllowsGCSRenderStorage(t *testing.T) {
	cfg := config.Config{
		DatabaseURL:           "postgres://user:pass@localhost/db",
		Mode:                  jobs.ModeRender,
		AssetStorageBackend:   "gcs",
		AssetStorageGCSBucket: "image-studio-assets",
		AssetStorageGCSPrefix: "generated-assets",
		Concurrency:           2,
	}

	err := validateStartupConfig(cfg, mapLookup(nil), slog.Default())

	if err != nil {
		t.Fatalf("gcs render startup should be allowed: %v", err)
	}
}

func TestValidateStartupRequiresGCSBucket(t *testing.T) {
	cfg := config.Config{
		DatabaseURL:         "postgres://user:pass@localhost/db",
		Mode:                jobs.ModeRender,
		AssetStorageBackend: "gcs",
		Concurrency:         2,
	}

	err := validateStartupConfig(cfg, mapLookup(nil), slog.Default())

	if err == nil {
		t.Fatal("expected missing gcs bucket to fail")
	}
}

func TestValidateStartupAllowsSimulateMode(t *testing.T) {
	cfg := config.Config{
		DatabaseURL:         "sqlite:///tmp/test.db",
		Mode:                jobs.ModeSimulate,
		AssetStorageBackend: "gcs",
		Concurrency:         2,
	}

	err := validateStartupConfig(cfg, mapLookup(nil), slog.Default())

	if err != nil {
		t.Fatalf("simulate startup should not require render checks: %v", err)
	}
}

func TestParseCleanupFlagsRequiresExplicitMode(t *testing.T) {
	if _, err := parseCleanupFlags([]string{}); err == nil {
		t.Fatal("expected missing cleanup mode to fail")
	}
	if _, err := parseCleanupFlags([]string{"--dry-run", "--execute"}); err == nil {
		t.Fatal("expected conflicting cleanup modes to fail")
	}
}

func TestParseCleanupFlagsAcceptsDryRunAndExecute(t *testing.T) {
	dryRun, err := parseCleanupFlags([]string{"--dry-run"})
	if err != nil {
		t.Fatalf("parse dry-run failed: %v", err)
	}
	if dryRun.Execute {
		t.Fatal("dry-run parsed as execute")
	}
	execute, err := parseCleanupFlags([]string{"--execute"})
	if err != nil {
		t.Fatalf("parse execute failed: %v", err)
	}
	if !execute.Execute {
		t.Fatal("execute flag did not enable cleanup")
	}
}

func mapLookup(values map[string]string) func(string) (string, bool) {
	return func(key string) (string, bool) {
		value, ok := values[key]
		return value, ok
	}
}
