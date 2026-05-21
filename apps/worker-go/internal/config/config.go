package config

import (
	"fmt"
	"os"
	"time"
)

const (
	defaultWorkerName          = "image-studio-go-worker"
	defaultMode                = "simulate"
	defaultConcurrency         = 2
	defaultProviderConcurrency = 2
	defaultOwnerConcurrency    = 1
	defaultModelConcurrency    = 2
	defaultPollSeconds         = 1
	defaultLeaseSeconds        = 600
	defaultHeartbeatSeconds    = 15
	defaultSimulateSeconds     = 3
	defaultRenderSeconds       = 300
	defaultRetryBaseSeconds    = 5
	defaultRetryMaxSeconds     = 300
	defaultFailSimulation      = false
	defaultStorageBackend      = "local"
	defaultStorageGCSPrefix    = "generated-assets"
	defaultGeneratedAssets     = "./generated-assets"
	defaultHTTPAddr            = ":7900"
	defaultEnableHTTP          = true
	secondsToDurationFactor    = time.Second
)

type Config struct {
	DatabaseURL                  string
	Mode                         string
	WorkerName                   string
	Concurrency                  int
	ProviderConcurrencyDefault   int
	ProviderConcurrencyOverrides map[string]int
	OwnerConcurrency             int
	ModelConcurrencyDefault      int
	PollInterval                 time.Duration
	LeaseSeconds                 int
	HeartbeatInterval            time.Duration
	SimulateDuration             time.Duration
	RenderTimeout                time.Duration
	RetryBaseSeconds             int
	RetryMaxSeconds              int
	FailSimulation               bool
	AssetStorageBackend          string
	AssetStorageGCSBucket        string
	AssetStorageGCSPrefix        string
	GeneratedAssetsDir           string
	HTTPAddr                     string
	EnableHTTP                   bool
}

type LookupFunc func(string) (string, bool)

func Load() (Config, error) {
	return LoadFromLookup(os.LookupEnv)
}

func LoadFromLookup(lookup LookupFunc) (Config, error) {
	databaseURL, ok := lookup("DATABASE_URL")
	if !ok || databaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	concurrency, err := parsePositiveInt(lookup, "GO_WORKER_CONCURRENCY", defaultConcurrency)
	if err != nil {
		return Config{}, err
	}
	limiters, err := loadLimiterConfig(lookup)
	if err != nil {
		return Config{}, err
	}
	pollSeconds, err := parsePositiveInt(lookup, "GO_WORKER_POLL_INTERVAL_SECONDS", defaultPollSeconds)
	if err != nil {
		return Config{}, err
	}
	return loadRemaining(lookup, configHead{
		databaseURL: databaseURL,
		concurrency: concurrency,
		limiters:    limiters,
		pollSeconds: pollSeconds,
	})
}

type configHead struct {
	databaseURL string
	concurrency int
	limiters    limiterConfig
	pollSeconds int
}

type limiterConfig struct {
	providerDefault   int
	providerOverrides map[string]int
	ownerLimit        int
	modelDefault      int
}

func loadRemaining(lookup LookupFunc, head configHead) (Config, error) {
	leaseSeconds, err := parsePositiveInt(lookup, "GO_WORKER_LEASE_SECONDS", defaultLeaseSeconds)
	if err != nil {
		return Config{}, err
	}
	heartbeatSeconds, err := parsePositiveInt(lookup, "GO_WORKER_HEARTBEAT_SECONDS", defaultHeartbeatSeconds)
	if err != nil {
		return Config{}, err
	}
	simulateSeconds, err := parsePositiveInt(lookup, "GO_WORKER_SIMULATE_SECONDS", defaultSimulateSeconds)
	if err != nil {
		return Config{}, err
	}
	renderSeconds, err := parsePositiveInt(lookup, "GO_WORKER_RENDER_TIMEOUT_SECONDS", defaultRenderSeconds)
	if err != nil {
		return Config{}, err
	}
	retryBaseSeconds, err := parsePositiveInt(lookup, "GO_WORKER_RETRY_BASE_SECONDS", defaultRetryBaseSeconds)
	if err != nil {
		return Config{}, err
	}
	retryMaxSeconds, err := parsePositiveInt(lookup, "GO_WORKER_RETRY_MAX_SECONDS", defaultRetryMaxSeconds)
	if err != nil {
		return Config{}, err
	}
	failSimulation, err := parseBool(lookup, "GO_WORKER_FAIL_SIMULATION", defaultFailSimulation)
	if err != nil {
		return Config{}, err
	}
	enableHTTP, err := parseBool(lookup, "GO_WORKER_ENABLE_HTTP", defaultEnableHTTP)
	if err != nil {
		return Config{}, err
	}
	mode, err := parseMode(lookup)
	if err != nil {
		return Config{}, err
	}
	return buildConfig(lookup, head, configTail{
		leaseSeconds:     leaseSeconds,
		heartbeatSeconds: heartbeatSeconds,
		simulateSeconds:  simulateSeconds,
		renderSeconds:    renderSeconds,
		retryBaseSeconds: retryBaseSeconds,
		retryMaxSeconds:  retryMaxSeconds,
		failSimulation:   failSimulation,
		enableHTTP:       enableHTTP,
		mode:             mode,
	}), nil
}

type configTail struct {
	leaseSeconds     int
	heartbeatSeconds int
	simulateSeconds  int
	renderSeconds    int
	retryBaseSeconds int
	retryMaxSeconds  int
	failSimulation   bool
	enableHTTP       bool
	mode             string
}

func buildConfig(lookup LookupFunc, head configHead, tail configTail) Config {
	workerName := defaultWorkerName
	if value, ok := lookup("GO_WORKER_NAME"); ok {
		workerName = value
	}
	return Config{
		DatabaseURL:                  head.databaseURL,
		Mode:                         tail.mode,
		WorkerName:                   workerName,
		Concurrency:                  head.concurrency,
		ProviderConcurrencyDefault:   head.limiters.providerDefault,
		ProviderConcurrencyOverrides: cloneIntMap(head.limiters.providerOverrides),
		OwnerConcurrency:             head.limiters.ownerLimit,
		ModelConcurrencyDefault:      head.limiters.modelDefault,
		PollInterval:                 time.Duration(head.pollSeconds) * secondsToDurationFactor,
		LeaseSeconds:                 tail.leaseSeconds,
		HeartbeatInterval:            time.Duration(tail.heartbeatSeconds) * secondsToDurationFactor,
		SimulateDuration:             time.Duration(tail.simulateSeconds) * secondsToDurationFactor,
		RenderTimeout:                time.Duration(tail.renderSeconds) * secondsToDurationFactor,
		RetryBaseSeconds:             tail.retryBaseSeconds,
		RetryMaxSeconds:              tail.retryMaxSeconds,
		FailSimulation:               tail.failSimulation,
		AssetStorageBackend:          stringDefault(lookup, "ASSET_STORAGE_BACKEND", defaultStorageBackend),
		AssetStorageGCSBucket:        stringDefault(lookup, "ASSET_STORAGE_GCS_BUCKET", ""),
		AssetStorageGCSPrefix:        stringDefault(lookup, "ASSET_STORAGE_GCS_PREFIX", defaultStorageGCSPrefix),
		GeneratedAssetsDir:           stringDefault(lookup, "GENERATED_ASSETS_DIR", defaultGeneratedAssets),
		HTTPAddr:                     stringDefault(lookup, "GO_WORKER_HTTP_ADDR", defaultHTTPAddr),
		EnableHTTP:                   tail.enableHTTP,
	}
}

func loadLimiterConfig(lookup LookupFunc) (limiterConfig, error) {
	providerDefault, err := parsePositiveInt(
		lookup, "GO_WORKER_PROVIDER_CONCURRENCY_DEFAULT", defaultProviderConcurrency,
	)
	if err != nil {
		return limiterConfig{}, err
	}
	ownerLimit, err := parsePositiveInt(lookup, "GO_WORKER_OWNER_CONCURRENCY", defaultOwnerConcurrency)
	if err != nil {
		return limiterConfig{}, err
	}
	modelDefault, err := parsePositiveInt(lookup, "GO_WORKER_MODEL_CONCURRENCY_DEFAULT", defaultModelConcurrency)
	if err != nil {
		return limiterConfig{}, err
	}
	overrides, err := parseConcurrencyOverrides(lookup, "GO_WORKER_PROVIDER_CONCURRENCY_OVERRIDES")
	if err != nil {
		return limiterConfig{}, err
	}
	return limiterConfig{
		providerDefault:   providerDefault,
		providerOverrides: overrides,
		ownerLimit:        ownerLimit,
		modelDefault:      modelDefault,
	}, nil
}

func parseMode(lookup LookupFunc) (string, error) {
	mode := stringDefault(lookup, "GO_WORKER_MODE", defaultMode)
	if mode != "simulate" && mode != "render" {
		return "", fmt.Errorf("GO_WORKER_MODE must be simulate or render")
	}
	return mode, nil
}

func cloneIntMap(values map[string]int) map[string]int {
	clone := make(map[string]int, len(values))
	for key, value := range values {
		clone[key] = value
	}
	return clone
}

func stringDefault(lookup LookupFunc, key string, defaultValue string) string {
	value, ok := lookup(key)
	if !ok || value == "" {
		return defaultValue
	}
	return value
}
