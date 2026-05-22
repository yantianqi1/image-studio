package main

import (
	"fmt"
	"log/slog"
	"strings"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/provider"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/config"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/jobs"
)

const highWorkerConcurrencyWarning = 32
const gcsStorageBackend = "gcs"

func validateStartupConfig(cfg config.Config, lookup config.LookupFunc, logger *slog.Logger) error {
	if cfg.Mode != jobs.ModeRender {
		return nil
	}
	if !isPostgresURL(cfg.DatabaseURL) {
		return fmt.Errorf("GO_WORKER_MODE=render requires postgres DATABASE_URL")
	}
	backend := strings.ToLower(strings.TrimSpace(cfg.AssetStorageBackend))
	if backend == storage.BackendLocal {
		return validateRenderConcurrency(cfg, lookup, logger)
	}
	if backend == gcsStorageBackend {
		if strings.TrimSpace(cfg.AssetStorageGCSBucket) == "" {
			return fmt.Errorf("ASSET_STORAGE_GCS_BUCKET is required for GO_WORKER_MODE=render")
		}
		return validateRenderConcurrency(cfg, lookup, logger)
	}
	return fmt.Errorf("GO_WORKER_MODE=render does not support ASSET_STORAGE_BACKEND=%s", cfg.AssetStorageBackend)
}

func validateRenderConcurrency(cfg config.Config, _ config.LookupFunc, logger *slog.Logger) error {
	if len(provider.SupportedRenderProviderTypes()) == 0 {
		return fmt.Errorf("GO_WORKER_MODE=render requires at least one supported provider type")
	}
	if cfg.Concurrency > highWorkerConcurrencyWarning {
		logger.Warn("GO_WORKER_GLOBAL_CONCURRENCY is high", "concurrency", cfg.Concurrency)
	}
	return nil
}

func isPostgresURL(databaseURL string) bool {
	normalized := strings.ToLower(strings.TrimSpace(databaseURL))
	return strings.HasPrefix(normalized, "postgres://") || strings.HasPrefix(normalized, "postgresql://")
}
