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
	if cfg.ProviderConcurrencyDefault != 2 || cfg.OwnerConcurrency != 1 || cfg.ModelConcurrencyDefault != 2 {
		t.Fatalf("unexpected limiter defaults: %+v", cfg)
	}
	if len(cfg.ProviderConcurrencyOverrides) != 0 {
		t.Fatalf("unexpected provider overrides: %#v", cfg.ProviderConcurrencyOverrides)
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
	if cfg.RetryBaseSeconds != 5 || cfg.RetryMaxSeconds != 300 {
		t.Fatalf("unexpected retry defaults: %+v", cfg)
	}
	if cfg.AssetStorageBackend != "local" || cfg.GeneratedAssetsDir != "./generated-assets" {
		t.Fatalf("unexpected asset storage config: %+v", cfg)
	}
	if !cfg.EnableHTTP || cfg.HTTPAddr != ":7900" {
		t.Fatalf("unexpected http diagnostics config: %+v", cfg)
	}
}

func TestLoadParsesOverrides(t *testing.T) {
	cfg, err := LoadFromLookup(mapLookup(map[string]string{
		"DATABASE_URL":                             "postgres://db",
		"GO_WORKER_NAME":                           "go-worker-a",
		"GO_WORKER_CONCURRENCY":                    "4",
		"GO_WORKER_PROVIDER_CONCURRENCY_DEFAULT":   "5",
		"GO_WORKER_PROVIDER_CONCURRENCY_OVERRIDES": "openrouter=2,openai-official=3",
		"GO_WORKER_OWNER_CONCURRENCY":              "6",
		"GO_WORKER_MODEL_CONCURRENCY_DEFAULT":      "7",
		"GO_WORKER_POLL_INTERVAL_SECONDS":          "2",
		"GO_WORKER_LEASE_SECONDS":                  "30",
		"GO_WORKER_HEARTBEAT_SECONDS":              "5",
		"GO_WORKER_SIMULATE_SECONDS":               "7",
		"GO_WORKER_FAIL_SIMULATION":                "true",
		"GO_WORKER_MODE":                           "render",
		"GO_WORKER_RENDER_TIMEOUT_SECONDS":         "120",
		"GO_WORKER_RETRY_BASE_SECONDS":             "10",
		"GO_WORKER_RETRY_MAX_SECONDS":              "90",
		"GO_WORKER_ENABLE_HTTP":                    "false",
		"GO_WORKER_HTTP_ADDR":                      ":7999",
		"ASSET_STORAGE_BACKEND":                    "gcs",
		"ASSET_STORAGE_GCS_BUCKET":                 "image-studio-assets",
		"ASSET_STORAGE_GCS_PREFIX":                 "generated-assets",
		"GENERATED_ASSETS_DIR":                     "/tmp/generated-assets",
	}))

	if err != nil {
		t.Fatalf("expected overrides to load, got %v", err)
	}
	if cfg.WorkerName != "go-worker-a" || cfg.Concurrency != 4 || cfg.LeaseSeconds != 30 {
		t.Fatalf("unexpected config: %+v", cfg)
	}
	if cfg.ProviderConcurrencyDefault != 5 || cfg.OwnerConcurrency != 6 || cfg.ModelConcurrencyDefault != 7 {
		t.Fatalf("unexpected limiter config: %+v", cfg)
	}
	if cfg.ProviderConcurrencyOverrides["openrouter"] != 2 || cfg.ProviderConcurrencyOverrides["openai-official"] != 3 {
		t.Fatalf("unexpected provider overrides: %#v", cfg.ProviderConcurrencyOverrides)
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
	if cfg.RetryBaseSeconds != 10 || cfg.RetryMaxSeconds != 90 {
		t.Fatalf("unexpected retry config: %+v", cfg)
	}
	if cfg.GeneratedAssetsDir != "/tmp/generated-assets" {
		t.Fatalf("unexpected generated assets dir %q", cfg.GeneratedAssetsDir)
	}
	if cfg.AssetStorageBackend != "gcs" || cfg.AssetStorageGCSBucket != "image-studio-assets" {
		t.Fatalf("unexpected gcs storage config: %+v", cfg)
	}
	if cfg.AssetStorageGCSPrefix != "generated-assets" {
		t.Fatalf("unexpected gcs prefix %q", cfg.AssetStorageGCSPrefix)
	}
	if cfg.EnableHTTP || cfg.HTTPAddr != ":7999" {
		t.Fatalf("unexpected http diagnostics overrides: %+v", cfg)
	}
}

func TestLoadRejectsInvalidProviderConcurrencyOverride(t *testing.T) {
	_, err := LoadFromLookup(mapLookup(map[string]string{
		"DATABASE_URL": "postgres://db",
		"GO_WORKER_PROVIDER_CONCURRENCY_OVERRIDES": "openrouter=0",
	}))

	if err == nil {
		t.Fatal("expected invalid provider override to fail")
	}
	if !strings.Contains(err.Error(), "GO_WORKER_PROVIDER_CONCURRENCY_OVERRIDES") {
		t.Fatalf("expected override error, got %v", err)
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
