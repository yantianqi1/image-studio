package jobs

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/observability"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/provider"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
)

const simulatedFailureMessage = "Go worker simulation failed by GO_WORKER_FAIL_SIMULATION=true"

const (
	ModeSimulate = "simulate"
	ModeRender   = "render"
)

type Store interface {
	ClaimQueued(context.Context, ClaimRequest) ([]int64, error)
	Heartbeat(context.Context, LeaseRequest) (bool, error)
	MarkSucceeded(context.Context, JobLock) (bool, error)
	MarkFailed(context.Context, FailRequest) (bool, error)
	LoadJobContext(context.Context, JobLock) (*provider.JobContext, error)
	CompleteRenderedJob(context.Context, CompleteRenderRequest) error
	HandleRenderFailure(context.Context, RenderFailureRequest) (RenderFailureResult, error)
}

type ProcessorConfig struct {
	Store                        Store
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
	RendererFactory              provider.RendererFactory
	AssetStorage                 storage.AssetStorage
	Metrics                      *observability.Metrics
	Logger                       *slog.Logger
}

type Processor struct {
	store                        Store
	mode                         string
	workerName                   string
	concurrency                  int
	providerConcurrencyDefault   int
	providerConcurrencyOverrides map[string]int
	ownerConcurrency             int
	modelConcurrencyDefault      int
	pollInterval                 time.Duration
	leaseSeconds                 int
	heartbeatInterval            time.Duration
	simulateDuration             time.Duration
	renderTimeout                time.Duration
	retryBaseSeconds             int
	retryMaxSeconds              int
	failSimulation               bool
	rendererFactory              provider.RendererFactory
	assetStorage                 storage.AssetStorage
	metrics                      *observability.Metrics
	logger                       *slog.Logger
	semaphore                    chan struct{}
	providerLimiter              *limiterPool
	modelLimiter                 *limiterPool
	wg                           sync.WaitGroup
}

func NewProcessor(cfg ProcessorConfig) (*Processor, error) {
	if err := validateProcessorConfig(cfg); err != nil {
		return nil, err
	}
	logger := cfg.Logger
	if logger == nil {
		logger = slog.Default()
	}
	metrics := cfg.Metrics
	if metrics == nil {
		metrics = observability.NewMetrics()
	}
	return &Processor{
		store:                        cfg.Store,
		mode:                         normalizeMode(cfg.Mode),
		workerName:                   cfg.WorkerName,
		concurrency:                  cfg.Concurrency,
		providerConcurrencyDefault:   cfg.ProviderConcurrencyDefault,
		providerConcurrencyOverrides: cloneLimiterOverrides(cfg.ProviderConcurrencyOverrides),
		ownerConcurrency:             cfg.OwnerConcurrency,
		modelConcurrencyDefault:      cfg.ModelConcurrencyDefault,
		pollInterval:                 cfg.PollInterval,
		leaseSeconds:                 cfg.LeaseSeconds,
		heartbeatInterval:            cfg.HeartbeatInterval,
		simulateDuration:             cfg.SimulateDuration,
		renderTimeout:                cfg.RenderTimeout,
		retryBaseSeconds:             cfg.RetryBaseSeconds,
		retryMaxSeconds:              cfg.RetryMaxSeconds,
		failSimulation:               cfg.FailSimulation,
		rendererFactory:              cfg.RendererFactory,
		assetStorage:                 cfg.AssetStorage,
		metrics:                      metrics,
		logger:                       logger,
		semaphore:                    make(chan struct{}, cfg.Concurrency),
		providerLimiter:              newLimiterPool(),
		modelLimiter:                 newLimiterPool(),
	}, nil
}

func (p *Processor) Metrics() *observability.Metrics {
	return p.metrics
}

func (p *Processor) Run(ctx context.Context) error {
	ticker := time.NewTicker(p.pollInterval)
	defer ticker.Stop()
	p.logger.Info("go image worker started", "worker", p.workerName, "mode", p.mode, "concurrency", p.concurrency)
	for {
		if err := p.claimAndStart(ctx); err != nil {
			p.wg.Wait()
			if ctx.Err() != nil {
				return nil
			}
			return err
		}
		select {
		case <-ctx.Done():
			p.logger.Info("go image worker shutting down", "worker", p.workerName)
			p.wg.Wait()
			return nil
		case <-ticker.C:
		}
	}
}

func (p *Processor) claimAndStart(ctx context.Context) error {
	available := cap(p.semaphore) - len(p.semaphore)
	if available < 1 {
		return nil
	}
	request := ClaimRequest{
		Limit: available, WorkerName: p.workerName,
		LeaseSeconds: p.leaseSeconds, OwnerConcurrency: p.ownerConcurrency,
	}
	if p.mode == ModeRender {
		request.SupportedProviderTypes = provider.SupportedRenderProviderTypes()
	}
	ids, err := p.store.ClaimQueued(ctx, request)
	if err != nil {
		return err
	}
	if len(ids) == 0 {
		p.metrics.IncClaimEmpty()
	} else {
		p.metrics.IncClaim(len(ids))
	}
	for _, id := range ids {
		p.startJob(ctx, id)
	}
	return nil
}

func (p *Processor) startJob(ctx context.Context, itemID int64) {
	p.semaphore <- struct{}{}
	p.wg.Add(1)
	go p.processJob(ctx, itemID)
}

func (p *Processor) processJob(ctx context.Context, itemID int64) {
	p.metrics.AddRunningItems(1)
	defer func() {
		p.metrics.AddRunningItems(-1)
		<-p.semaphore
		p.wg.Done()
	}()
	if p.mode == ModeRender {
		p.processRenderJob(ctx, itemID)
		return
	}
	p.processSimulationJob(ctx, itemID)
}

func validateProcessorConfig(cfg ProcessorConfig) error {
	if cfg.Store == nil {
		return fmt.Errorf("job store is required")
	}
	if normalizeMode(cfg.Mode) == ModeRender {
		if cfg.RendererFactory == nil || cfg.AssetStorage == nil {
			return fmt.Errorf("renderer factory and asset storage are required in render mode")
		}
		if cfg.RenderTimeout <= 0 {
			return fmt.Errorf("render timeout must be positive")
		}
	}
	if cfg.WorkerName == "" {
		return fmt.Errorf("worker name is required")
	}
	if cfg.Concurrency < 1 || cfg.PollInterval <= 0 || cfg.LeaseSeconds < 1 {
		return fmt.Errorf("worker concurrency, poll interval, and lease seconds must be positive")
	}
	if cfg.ProviderConcurrencyDefault < 1 || cfg.OwnerConcurrency < 1 || cfg.ModelConcurrencyDefault < 1 {
		return fmt.Errorf("worker limiter concurrency values must be positive")
	}
	if cfg.HeartbeatInterval <= 0 || cfg.SimulateDuration <= 0 {
		return fmt.Errorf("heartbeat interval and simulate duration must be positive")
	}
	return nil
}

func normalizeMode(mode string) string {
	if mode == "" {
		return ModeSimulate
	}
	return mode
}

func isContextCanceledByParent(ctx context.Context, err error) bool {
	return ctx.Err() != nil && errors.Is(err, context.Canceled)
}
