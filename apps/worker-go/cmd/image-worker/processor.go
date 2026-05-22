package main

import (
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/observability"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/provider"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/config"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/control"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/jobs"
)

type processorBuildRequest struct {
	Config          config.Config
	Pool            *pgxpool.Pool
	AssetStorage    storage.AssetStorage
	RendererFactory provider.RendererFactory
	Metrics         *observability.Metrics
	Controller      *control.Controller
	Logger          *slog.Logger
}

func newProcessor(request processorBuildRequest) (*jobs.Processor, error) {
	cfg := request.Config
	return jobs.NewProcessor(jobs.ProcessorConfig{
		Store: jobs.NewPostgresStore(request.Pool), WorkerName: cfg.WorkerName, Mode: cfg.Mode,
		Concurrency: cfg.Concurrency, ProviderConcurrencyDefault: cfg.ProviderConcurrencyDefault,
		ProviderConcurrencyOverrides: cfg.ProviderConcurrencyOverrides, OwnerConcurrency: cfg.OwnerConcurrency,
		AnonymousOwnerConcurrency: cfg.AnonymousOwnerConcurrency, ModelConcurrencyDefault: cfg.ModelConcurrencyDefault,
		PollInterval: cfg.PollInterval, LeaseSeconds: cfg.LeaseSeconds, HeartbeatInterval: cfg.HeartbeatInterval,
		SimulateDuration: cfg.SimulateDuration, RenderTimeout: cfg.RenderTimeout,
		RetryBaseSeconds: cfg.RetryBaseSeconds, RetryMaxSeconds: cfg.RetryMaxSeconds,
		ProviderCircuitFailureThreshold: cfg.ProviderCircuitFailureThreshold,
		ProviderCircuitOpenSeconds:      cfg.ProviderCircuitOpenSeconds,
		RendererFactory:                 request.RendererFactory, AssetStorage: request.AssetStorage, Metrics: request.Metrics,
		ControlSource: request.Controller, Logger: request.Logger,
	})
}
