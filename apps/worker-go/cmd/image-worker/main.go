package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/yantianqi1/image-studio/apps/worker-go/internal/config"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/db"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/jobs"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/provider"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/storage"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		logger.Error("go image worker stopped with error", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	assetStorage, rendererFactory, err := buildRenderDependencies(cfg)
	if err != nil {
		return err
	}
	processor, err := jobs.NewProcessor(jobs.ProcessorConfig{
		Store: jobs.NewPostgresStore(pool), WorkerName: cfg.WorkerName,
		Mode:        cfg.Mode,
		Concurrency: cfg.Concurrency, PollInterval: cfg.PollInterval,
		LeaseSeconds: cfg.LeaseSeconds, HeartbeatInterval: cfg.HeartbeatInterval,
		SimulateDuration: cfg.SimulateDuration, RenderTimeout: cfg.RenderTimeout,
		RetryDelaySeconds: 5, FailSimulation: cfg.FailSimulation,
		RendererFactory: rendererFactory, AssetStorage: assetStorage,
		Logger: logger,
	})
	if err != nil {
		return err
	}
	return processor.Run(ctx)
}

func buildRenderDependencies(cfg config.Config) (storage.AssetStorage, provider.RendererFactory, error) {
	if cfg.Mode != jobs.ModeRender {
		return nil, nil, nil
	}
	assetStorage, err := storage.BuildAssetStorage(storage.Config{
		Backend: cfg.AssetStorageBackend, GeneratedAssetsDir: cfg.GeneratedAssetsDir,
	})
	if err != nil {
		return nil, nil, err
	}
	factory := provider.NewFactory(provider.FactoryConfig{
		HTTPClient: http.DefaultClient, Storage: assetStorage, LookupEnv: os.LookupEnv,
	})
	return assetStorage, factory, nil
}
