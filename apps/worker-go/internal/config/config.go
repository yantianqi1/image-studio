package config

import (
	"fmt"
	"os"
	"time"
)

const (
	defaultWorkerName          = "image-studio-go-worker"
	defaultMode                = "render"
	defaultConcurrency         = 2
	defaultProviderConcurrency = 2
	defaultOwnerConcurrency    = 1
	defaultAnonymousOwnerLimit = 1
	defaultModelConcurrency    = 2
	defaultPollSeconds         = 1
	defaultLeaseSeconds        = 600
	defaultHeartbeatSeconds    = 15
	defaultSimulateSeconds     = 3
	defaultRenderSeconds       = 300
	defaultRetryBaseSeconds    = 5
	defaultRetryMaxSeconds     = 300
	defaultCircuitFailures     = 5
	defaultCircuitOpenSeconds  = 300
	defaultStorageBackend      = "local"
	defaultStorageGCSPrefix    = "generated-assets"
	defaultGeneratedAssets     = "./generated-assets"
	defaultHTTPAddr            = ":7900"
	defaultEnableHTTP          = true
	defaultEnablePprof         = false
	defaultRuntimeConfigKey    = "worker-go"
	defaultVersion             = "dev"
	secondsToDurationFactor    = time.Second
)

type Config struct {
	DatabaseURL                     string
	WorkerID                        string
	Mode                            string
	WorkerName                      string
	Version                         string
	Concurrency                     int
	ProviderConcurrencyDefault      int
	ProviderConcurrencyOverrides    map[string]int
	OwnerConcurrency                int
	AnonymousOwnerConcurrency       int
	ModelConcurrencyDefault         int
	PollInterval                    time.Duration
	LeaseSeconds                    int
	HeartbeatInterval               time.Duration
	SimulateDuration                time.Duration
	RenderTimeout                   time.Duration
	RetryBaseSeconds                int
	RetryMaxSeconds                 int
	ProviderCircuitFailureThreshold int
	ProviderCircuitOpenSeconds      int
	AssetStorageBackend             string
	AssetStorageGCSBucket           string
	AssetStorageGCSPrefix           string
	GeneratedAssetsDir              string
	HTTPAddr                        string
	EnableHTTP                      bool
	EnablePprof                     bool
	RuntimeConfigKey                string
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
	concurrency, err := parseGlobalConcurrency(lookup)
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
	anonymousLimit    int
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
	circuit, err := loadProviderCircuitConfig(lookup)
	if err != nil {
		return Config{}, err
	}
	enableHTTP, err := parseBool(lookup, "GO_WORKER_ENABLE_HTTP", defaultEnableHTTP)
	if err != nil {
		return Config{}, err
	}
	enablePprof, err := parseBool(lookup, "GO_ENABLE_PPROF", defaultEnablePprof)
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
		circuit:          circuit,
		enableHTTP:       enableHTTP,
		enablePprof:      enablePprof,
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
	circuit          providerCircuitConfig
	enableHTTP       bool
	enablePprof      bool
	mode             string
}

type providerCircuitConfig struct {
	failureThreshold int
	openSeconds      int
}

func buildConfig(lookup LookupFunc, head configHead, tail configTail) Config {
	workerName := defaultWorkerName
	if value, ok := lookup("GO_WORKER_NAME"); ok {
		workerName = value
	}
	return Config{
		DatabaseURL:                     head.databaseURL,
		WorkerID:                        stringDefault(lookup, "GO_WORKER_ID", ""),
		Mode:                            tail.mode,
		WorkerName:                      workerName,
		Version:                         stringDefault(lookup, "APP_VERSION", defaultVersion),
		Concurrency:                     head.concurrency,
		ProviderConcurrencyDefault:      head.limiters.providerDefault,
		ProviderConcurrencyOverrides:    cloneIntMap(head.limiters.providerOverrides),
		OwnerConcurrency:                head.limiters.ownerLimit,
		AnonymousOwnerConcurrency:       head.limiters.anonymousLimit,
		ModelConcurrencyDefault:         head.limiters.modelDefault,
		PollInterval:                    time.Duration(head.pollSeconds) * secondsToDurationFactor,
		LeaseSeconds:                    tail.leaseSeconds,
		HeartbeatInterval:               time.Duration(tail.heartbeatSeconds) * secondsToDurationFactor,
		SimulateDuration:                time.Duration(tail.simulateSeconds) * secondsToDurationFactor,
		RenderTimeout:                   time.Duration(tail.renderSeconds) * secondsToDurationFactor,
		RetryBaseSeconds:                tail.retryBaseSeconds,
		RetryMaxSeconds:                 tail.retryMaxSeconds,
		ProviderCircuitFailureThreshold: tail.circuit.failureThreshold,
		ProviderCircuitOpenSeconds:      tail.circuit.openSeconds,
		AssetStorageBackend:             stringDefault(lookup, "ASSET_STORAGE_BACKEND", defaultStorageBackend),
		AssetStorageGCSBucket:           stringDefault(lookup, "ASSET_STORAGE_GCS_BUCKET", ""),
		AssetStorageGCSPrefix:           stringDefault(lookup, "ASSET_STORAGE_GCS_PREFIX", defaultStorageGCSPrefix),
		GeneratedAssetsDir:              stringDefault(lookup, "GENERATED_ASSETS_DIR", defaultGeneratedAssets),
		HTTPAddr:                        stringDefault(lookup, "GO_WORKER_HTTP_ADDR", defaultHTTPAddr),
		EnableHTTP:                      tail.enableHTTP,
		EnablePprof:                     tail.enablePprof,
		RuntimeConfigKey:                stringDefault(lookup, "GO_WORKER_RUNTIME_CONFIG_KEY", defaultRuntimeConfigKey),
	}
}

func loadProviderCircuitConfig(lookup LookupFunc) (providerCircuitConfig, error) {
	threshold, err := parsePositiveInt(
		lookup, "GO_WORKER_PROVIDER_CIRCUIT_FAILURE_THRESHOLD", defaultCircuitFailures,
	)
	if err != nil {
		return providerCircuitConfig{}, err
	}
	openSeconds, err := parsePositiveInt(
		lookup, "GO_WORKER_PROVIDER_CIRCUIT_OPEN_SECONDS", defaultCircuitOpenSeconds,
	)
	if err != nil {
		return providerCircuitConfig{}, err
	}
	return providerCircuitConfig{failureThreshold: threshold, openSeconds: openSeconds}, nil
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
	anonymousLimit, err := parsePositiveInt(
		lookup, "GO_WORKER_ANONYMOUS_OWNER_CONCURRENCY", defaultAnonymousOwnerLimit,
	)
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
		anonymousLimit:    anonymousLimit,
		modelDefault:      modelDefault,
	}, nil
}

func parseGlobalConcurrency(lookup LookupFunc) (int, error) {
	if _, ok := lookup("GO_WORKER_GLOBAL_CONCURRENCY"); ok {
		return parsePositiveInt(lookup, "GO_WORKER_GLOBAL_CONCURRENCY", defaultConcurrency)
	}
	return parsePositiveInt(lookup, "GO_WORKER_CONCURRENCY", defaultConcurrency)
}

func parseMode(lookup LookupFunc) (string, error) {
	mode := stringDefault(lookup, "GO_WORKER_MODE", defaultMode)
	if mode != "simulate" && mode != "render" {
		return "", fmt.Errorf("GO_WORKER_MODE must be simulate or render")
	}
	return mode, nil
}
