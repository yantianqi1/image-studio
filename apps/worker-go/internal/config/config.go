package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

const (
	defaultWorkerName       = "image-studio-go-worker"
	defaultMode             = "simulate"
	defaultConcurrency      = 2
	defaultPollSeconds      = 1
	defaultLeaseSeconds     = 600
	defaultHeartbeatSeconds = 15
	defaultSimulateSeconds  = 3
	defaultRenderSeconds    = 300
	defaultFailSimulation   = false
	defaultStorageBackend   = "local"
	defaultGeneratedAssets  = "./generated-assets"
	secondsToDurationFactor = time.Second
)

type Config struct {
	DatabaseURL         string
	Mode                string
	WorkerName          string
	Concurrency         int
	PollInterval        time.Duration
	LeaseSeconds        int
	HeartbeatInterval   time.Duration
	SimulateDuration    time.Duration
	RenderTimeout       time.Duration
	FailSimulation      bool
	AssetStorageBackend string
	GeneratedAssetsDir  string
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
	pollSeconds, err := parsePositiveInt(lookup, "GO_WORKER_POLL_INTERVAL_SECONDS", defaultPollSeconds)
	if err != nil {
		return Config{}, err
	}
	return loadRemaining(lookup, configHead{
		databaseURL: databaseURL,
		concurrency: concurrency,
		pollSeconds: pollSeconds,
	})
}

type configHead struct {
	databaseURL string
	concurrency int
	pollSeconds int
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
	failSimulation, err := parseBool(lookup, "GO_WORKER_FAIL_SIMULATION", defaultFailSimulation)
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
		failSimulation:   failSimulation,
		mode:             mode,
	}), nil
}

type configTail struct {
	leaseSeconds     int
	heartbeatSeconds int
	simulateSeconds  int
	renderSeconds    int
	failSimulation   bool
	mode             string
}

func buildConfig(lookup LookupFunc, head configHead, tail configTail) Config {
	workerName := defaultWorkerName
	if value, ok := lookup("GO_WORKER_NAME"); ok {
		workerName = value
	}
	return Config{
		DatabaseURL:         head.databaseURL,
		Mode:                tail.mode,
		WorkerName:          workerName,
		Concurrency:         head.concurrency,
		PollInterval:        time.Duration(head.pollSeconds) * secondsToDurationFactor,
		LeaseSeconds:        tail.leaseSeconds,
		HeartbeatInterval:   time.Duration(tail.heartbeatSeconds) * secondsToDurationFactor,
		SimulateDuration:    time.Duration(tail.simulateSeconds) * secondsToDurationFactor,
		RenderTimeout:       time.Duration(tail.renderSeconds) * secondsToDurationFactor,
		FailSimulation:      tail.failSimulation,
		AssetStorageBackend: stringDefault(lookup, "ASSET_STORAGE_BACKEND", defaultStorageBackend),
		GeneratedAssetsDir:  stringDefault(lookup, "GENERATED_ASSETS_DIR", defaultGeneratedAssets),
	}
}

func parseMode(lookup LookupFunc) (string, error) {
	mode := stringDefault(lookup, "GO_WORKER_MODE", defaultMode)
	if mode != "simulate" && mode != "render" {
		return "", fmt.Errorf("GO_WORKER_MODE must be simulate or render")
	}
	return mode, nil
}

func parsePositiveInt(lookup LookupFunc, key string, defaultValue int) (int, error) {
	raw, ok := lookup(key)
	if !ok {
		return defaultValue, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer: %w", key, err)
	}
	if value < 1 {
		return 0, fmt.Errorf("%s must be at least 1", key)
	}
	return value, nil
}

func parseBool(lookup LookupFunc, key string, defaultValue bool) (bool, error) {
	raw, ok := lookup(key)
	if !ok {
		return defaultValue, nil
	}
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return false, fmt.Errorf("%s must be a boolean: %w", key, err)
	}
	return value, nil
}

func stringDefault(lookup LookupFunc, key string, defaultValue string) string {
	value, ok := lookup(key)
	if !ok || value == "" {
		return defaultValue
	}
	return value
}
