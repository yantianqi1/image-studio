package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/observability"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/provider"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/config"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/db"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/jobs"
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
	if err := validateStartupConfig(cfg, os.LookupEnv, logger); err != nil {
		return err
	}
	if commandName(os.Args) == "cleanup-orphan-assets" {
		return runCleanupOrphanAssets(ctx, cfg, os.Args[2:])
	}
	return runWorker(ctx, cfg, logger)
}

func runWorker(ctx context.Context, cfg config.Config, logger *slog.Logger) error {
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
		Store:                        jobs.NewPostgresStore(pool),
		WorkerName:                   cfg.WorkerName,
		Mode:                         cfg.Mode,
		Concurrency:                  cfg.Concurrency,
		ProviderConcurrencyDefault:   cfg.ProviderConcurrencyDefault,
		ProviderConcurrencyOverrides: cfg.ProviderConcurrencyOverrides,
		OwnerConcurrency:             cfg.OwnerConcurrency,
		ModelConcurrencyDefault:      cfg.ModelConcurrencyDefault,
		PollInterval:                 cfg.PollInterval,
		LeaseSeconds:                 cfg.LeaseSeconds,
		HeartbeatInterval:            cfg.HeartbeatInterval,
		SimulateDuration:             cfg.SimulateDuration,
		RenderTimeout:                cfg.RenderTimeout,
		RetryBaseSeconds:             cfg.RetryBaseSeconds,
		RetryMaxSeconds:              cfg.RetryMaxSeconds,
		FailSimulation:               cfg.FailSimulation,
		RendererFactory:              rendererFactory,
		AssetStorage:                 assetStorage,
		Logger:                       logger,
	})
	if err != nil {
		return err
	}
	stopDiagnostics, err := startDiagnostics(ctx, cfg, pool, assetStorage, processor.Metrics(), logger)
	if err != nil {
		return err
	}
	defer stopDiagnostics()
	return processor.Run(ctx)
}

func runCleanupOrphanAssets(ctx context.Context, cfg config.Config, args []string) error {
	flags := flag.NewFlagSet("cleanup-orphan-assets", flag.ContinueOnError)
	execute := flags.Bool("execute", false, "delete orphan generated asset files")
	if err := flags.Parse(args); err != nil {
		return err
	}
	assetStorage, err := storage.BuildAssetStorage(storage.Config{
		Backend: cfg.AssetStorageBackend, GeneratedAssetsDir: cfg.GeneratedAssetsDir,
	})
	if err != nil {
		return err
	}
	lister, ok := assetStorage.(jobs.OrphanAssetStorage)
	if !ok {
		return fmt.Errorf("asset storage does not support orphan cleanup")
	}
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	summary, err := jobs.CleanupOrphanAssets(ctx, jobs.OrphanCleanupRequest{
		Storage: lister, Store: jobs.NewPostgresStore(pool), Execute: *execute,
	})
	if err != nil {
		return err
	}
	fmt.Fprintf(os.Stdout, "orphan_assets scanned=%d referenced=%d orphaned=%d deleted=%d dry_run=%t\n",
		summary.Scanned, summary.Referenced, summary.Orphaned, summary.Deleted, !*execute)
	return nil
}

func commandName(args []string) string {
	if len(args) < 2 {
		return ""
	}
	return args[1]
}

func startDiagnostics(
	ctx context.Context,
	cfg config.Config,
	pool readinessDB,
	assetStorage storage.AssetStorage,
	metrics *observability.Metrics,
	logger *slog.Logger,
) (func(), error) {
	if !cfg.EnableHTTP {
		return func() {}, nil
	}
	handler := observability.NewDiagnosticsHandler(metrics, newReadyFunc(pool, assetStorage, cfg.Mode))
	server := &http.Server{Addr: cfg.HTTPAddr, Handler: handler}
	listener, err := net.Listen("tcp", cfg.HTTPAddr)
	if err != nil {
		return nil, fmt.Errorf("start go worker diagnostics http: %w", err)
	}
	go serveDiagnostics(server, listener, logger)
	return func() { shutdownDiagnostics(ctx, server) }, nil
}

func serveDiagnostics(server *http.Server, listener net.Listener, logger *slog.Logger) {
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		logger.Error("go worker diagnostics http stopped with error", "error", err)
	}
}

func shutdownDiagnostics(ctx context.Context, server *http.Server) {
	shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
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
