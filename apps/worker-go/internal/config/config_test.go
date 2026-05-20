package config

import (
	"strings"
	"testing"
	"time"
)

func TestLoadRequiresDatabaseURL(t *testing.T) {
	_, err := LoadFromLookup(mapLookup(nil))

	if err == nil {
		t.Fatal("expected missing DATABASE_URL to fail")
	}
	if !strings.Contains(err.Error(), "DATABASE_URL") {
		t.Fatalf("expected DATABASE_URL error, got %v", err)
	}
}

func TestLoadUsesDefaults(t *testing.T) {
	cfg, err := LoadFromLookup(mapLookup(map[string]string{
		"DATABASE_URL": "postgres://user:pass@localhost:5432/image_studio",
	}))

	if err != nil {
		t.Fatalf("expected defaults to load, got %v", err)
	}
	if cfg.WorkerName != "image-studio-go-worker" {
		t.Fatalf("unexpected worker name %q", cfg.WorkerName)
	}
	if cfg.Concurrency != 2 {
		t.Fatalf("unexpected concurrency %d", cfg.Concurrency)
	}
	if cfg.PollInterval != time.Second {
		t.Fatalf("unexpected poll interval %s", cfg.PollInterval)
	}
	if cfg.LeaseSeconds != 600 {
		t.Fatalf("unexpected lease seconds %d", cfg.LeaseSeconds)
	}
	if cfg.HeartbeatInterval != 15*time.Second {
		t.Fatalf("unexpected heartbeat interval %s", cfg.HeartbeatInterval)
	}
	if cfg.SimulateDuration != 3*time.Second {
		t.Fatalf("unexpected simulate duration %s", cfg.SimulateDuration)
	}
	if cfg.FailSimulation {
		t.Fatal("expected fail simulation default to be false")
	}
	if cfg.Mode != "simulate" {
		t.Fatalf("expected default mode simulate, got %q", cfg.Mode)
	}
	if cfg.RenderTimeout != 300*time.Second {
		t.Fatalf("unexpected render timeout %s", cfg.RenderTimeout)
	}
	if cfg.AssetStorageBackend != "local" || cfg.GeneratedAssetsDir != "./generated-assets" {
		t.Fatalf("unexpected asset storage config: %+v", cfg)
	}
}

func TestLoadParsesOverrides(t *testing.T) {
	cfg, err := LoadFromLookup(mapLookup(map[string]string{
		"DATABASE_URL":                     "postgres://db",
		"GO_WORKER_NAME":                   "go-worker-a",
		"GO_WORKER_CONCURRENCY":            "4",
		"GO_WORKER_POLL_INTERVAL_SECONDS":  "2",
		"GO_WORKER_LEASE_SECONDS":          "30",
		"GO_WORKER_HEARTBEAT_SECONDS":      "5",
		"GO_WORKER_SIMULATE_SECONDS":       "7",
		"GO_WORKER_FAIL_SIMULATION":        "true",
		"GO_WORKER_MODE":                   "render",
		"GO_WORKER_RENDER_TIMEOUT_SECONDS": "120",
		"ASSET_STORAGE_BACKEND":            "local",
		"GENERATED_ASSETS_DIR":             "/tmp/generated-assets",
	}))

	if err != nil {
		t.Fatalf("expected overrides to load, got %v", err)
	}
	if cfg.WorkerName != "go-worker-a" || cfg.Concurrency != 4 || cfg.LeaseSeconds != 30 {
		t.Fatalf("unexpected config: %+v", cfg)
	}
	if cfg.PollInterval != 2*time.Second || cfg.HeartbeatInterval != 5*time.Second {
		t.Fatalf("unexpected intervals: %+v", cfg)
	}
	if cfg.SimulateDuration != 7*time.Second || !cfg.FailSimulation {
		t.Fatalf("unexpected simulation config: %+v", cfg)
	}
	if cfg.Mode != "render" || cfg.RenderTimeout != 120*time.Second {
		t.Fatalf("unexpected render config: %+v", cfg)
	}
	if cfg.GeneratedAssetsDir != "/tmp/generated-assets" {
		t.Fatalf("unexpected generated assets dir %q", cfg.GeneratedAssetsDir)
	}
}

func TestLoadRejectsInvalidInteger(t *testing.T) {
	_, err := LoadFromLookup(mapLookup(map[string]string{
		"DATABASE_URL":          "postgres://db",
		"GO_WORKER_CONCURRENCY": "not-an-int",
	}))

	if err == nil {
		t.Fatal("expected invalid integer to fail")
	}
	if !strings.Contains(err.Error(), "GO_WORKER_CONCURRENCY") {
		t.Fatalf("expected concurrency error, got %v", err)
	}
}

func TestLoadRejectsInvalidMode(t *testing.T) {
	_, err := LoadFromLookup(mapLookup(map[string]string{
		"DATABASE_URL":   "postgres://db",
		"GO_WORKER_MODE": "unknown",
	}))

	if err == nil {
		t.Fatal("expected invalid worker mode to fail")
	}
	if !strings.Contains(err.Error(), "GO_WORKER_MODE") {
		t.Fatalf("expected mode error, got %v", err)
	}
}

func mapLookup(values map[string]string) func(string) (string, bool) {
	return func(key string) (string, bool) {
		value, ok := values[key]
		return value, ok
	}
}
