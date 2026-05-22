package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/observability"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/workercontrol"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/config"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/control"
)

type workerControlStartRequest struct {
	Context context.Context
	Config  config.Config
	Pool    *pgxpool.Pool
	Metrics *observability.Metrics
	Logger  *slog.Logger
}

func startWorkerControl(request workerControlStartRequest) (*control.Controller, error) {
	hostname, err := workerHostname()
	if err != nil {
		return nil, err
	}
	cfg := request.Config
	controller := control.NewController(control.Config{
		Store: workercontrol.NewPostgresStore(request.Pool), WorkerID: cfg.WorkerID,
		WorkerName: cfg.WorkerName, Hostname: hostname, Version: cfg.Version,
		Mode: cfg.Mode, Concurrency: cfg.Concurrency, PollInterval: cfg.PollInterval,
		ProviderConcurrencyDefault: cfg.ProviderConcurrencyDefault,
		RuntimeConfigKey:           cfg.RuntimeConfigKey, Metrics: request.Metrics, Logger: request.Logger,
	})
	if err := controller.Start(request.Context); err != nil {
		return nil, err
	}
	go controller.Run(request.Context)
	return controller, nil
}

func stopWorkerControl(ctx context.Context, controller *control.Controller) error {
	shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	return controller.Stop(shutdownCtx)
}

func stopWorkerControlAfterError(ctx context.Context, controller *control.Controller, cause error) error {
	if stopErr := stopWorkerControl(ctx, controller); stopErr != nil {
		return errors.Join(cause, stopErr)
	}
	return cause
}

func workerHostname() (string, error) {
	hostname, err := os.Hostname()
	if err != nil {
		return "", fmt.Errorf("detect worker hostname: %w", err)
	}
	return hostname, nil
}
