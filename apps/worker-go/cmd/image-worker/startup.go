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

func validateStartupConfig(cfg config.Config, lookup config.LookupFunc, logger *slog.Logger) error {
	if cfg.Mode != jobs.ModeRender {
		return nil
	}
	if !isPostgresURL(cfg.DatabaseURL) {
		return fmt.Errorf("GO_WORKER_MODE=render requires postgres DATABASE_URL")
	}
	if strings.ToLower(strings.TrimSpace(cfg.AssetStorageBackend)) != storage.BackendLocal {
		return fmt.Errorf("GO_WORKER_MODE=render only supports ASSET_STORAGE_BACKEND=local")
	}
	if len(provider.SupportedRenderProviderTypes()) == 0 {
		return fmt.Errorf("GO_WORKER_MODE=render requires at least one supported provider type")
	}
	if cfg.Concurrency > highWorkerConcurrencyWarning {
		logger.Warn("GO_WORKER_CONCURRENCY is high", "concurrency", cfg.Concurrency)
	}
	if enabled, ok := lookup("WORKER_ENABLE_IMAGE_JOBS"); ok && strings.EqualFold(enabled, "true") {
		logger.Warn("python worker image_jobs branch is enabled while go worker render mode is active")
	}
	return nil
}

func isPostgresURL(databaseURL string) bool {
	normalized := strings.ToLower(strings.TrimSpace(databaseURL))
	return strings.HasPrefix(normalized, "postgres://") || strings.HasPrefix(normalized, "postgresql://")
}
