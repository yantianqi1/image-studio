package jobs

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/yantianqi1/image-studio/apps/worker-go/internal/provider"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/storage"
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
	HandleRenderFailure(context.Context, RenderFailureRequest) (bool, error)
}

type ProcessorConfig struct {
	Store             Store
	Mode              string
	WorkerName        string
	Concurrency       int
	PollInterval      time.Duration
	LeaseSeconds      int
	HeartbeatInterval time.Duration
	SimulateDuration  time.Duration
	RenderTimeout     time.Duration
	RetryDelaySeconds int
	FailSimulation    bool
	RendererFactory   provider.RendererFactory
	AssetStorage      storage.AssetStorage
	Logger            *slog.Logger
}

type Processor struct {
	store             Store
	mode              string
	workerName        string
	concurrency       int
	pollInterval      time.Duration
	leaseSeconds      int
	heartbeatInterval time.Duration
	simulateDuration  time.Duration
	renderTimeout     time.Duration
	retryDelaySeconds int
	failSimulation    bool
	rendererFactory   provider.RendererFactory
	assetStorage      storage.AssetStorage
	logger            *slog.Logger
	semaphore         chan struct{}
	wg                sync.WaitGroup
}

func NewProcessor(cfg ProcessorConfig) (*Processor, error) {
	if err := validateProcessorConfig(cfg); err != nil {
		return nil, err
	}
	logger := cfg.Logger
	if logger == nil {
		logger = slog.Default()
	}
	return &Processor{
		store:             cfg.Store,
		mode:              normalizeMode(cfg.Mode),
		workerName:        cfg.WorkerName,
		concurrency:       cfg.Concurrency,
		pollInterval:      cfg.PollInterval,
		leaseSeconds:      cfg.LeaseSeconds,
		heartbeatInterval: cfg.HeartbeatInterval,
		simulateDuration:  cfg.SimulateDuration,
		renderTimeout:     cfg.RenderTimeout,
		retryDelaySeconds: cfg.RetryDelaySeconds,
		failSimulation:    cfg.FailSimulation,
		rendererFactory:   cfg.RendererFactory,
		assetStorage:      cfg.AssetStorage,
		logger:            logger,
		semaphore:         make(chan struct{}, cfg.Concurrency),
	}, nil
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
	request := ClaimRequest{Limit: available, WorkerName: p.workerName, LeaseSeconds: p.leaseSeconds}
	if p.mode == ModeRender {
		request.SupportedProviderTypes = []string{provider.OpenAIChatCompatibleType}
	}
	ids, err := p.store.ClaimQueued(ctx, request)
	if err != nil {
		return err
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
	defer func() {
		<-p.semaphore
		p.wg.Done()
	}()
	if p.mode == ModeRender {
		p.processRenderJob(ctx, itemID)
		return
	}
	p.processSimulationJob(ctx, itemID)
}

func (p *Processor) processSimulationJob(ctx context.Context, itemID int64) {
	p.logger.Info("image job item simulation started", "item_id", itemID)
	timer := time.NewTimer(p.simulateDuration)
	ticker := time.NewTicker(p.heartbeatInterval)
	defer timer.Stop()
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			p.logger.Info("image job item simulation stopped", "item_id", itemID)
			return
		case <-ticker.C:
			if !p.sendHeartbeat(ctx, itemID) {
				return
			}
		case <-timer.C:
			p.finishSimulation(ctx, itemID)
			return
		}
	}
}

func (p *Processor) sendHeartbeat(ctx context.Context, itemID int64) bool {
	ok, err := p.store.Heartbeat(ctx, LeaseRequest{
		ItemID: itemID, WorkerName: p.workerName, LeaseSeconds: p.leaseSeconds,
	})
	if err != nil {
		p.logger.Error("image job item heartbeat failed", "item_id", itemID, "error", err)
		return false
	}
	if !ok {
		p.logger.Error("image job heartbeat did not update a running locked item", "item_id", itemID)
		return false
	}
	return true
}

func (p *Processor) finishSimulation(ctx context.Context, itemID int64) {
	lock := JobLock{ItemID: itemID, WorkerName: p.workerName}
	if p.failSimulation {
		p.markFailed(ctx, itemID)
		return
	}
	ok, err := p.store.MarkSucceeded(ctx, lock)
	if err != nil {
		p.logger.Error("image job item succeeded update failed", "item_id", itemID, "error", err)
		return
	}
	if !ok {
		p.logger.Error("image job item succeeded update did not match lock", "item_id", itemID)
		return
	}
	p.logger.Info("image job item simulation succeeded", "item_id", itemID)
}

func (p *Processor) markFailed(ctx context.Context, itemID int64) {
	ok, err := p.store.MarkFailed(ctx, FailRequest{
		ItemID: itemID, WorkerName: p.workerName, Message: simulatedFailureMessage,
	})
	if err != nil {
		p.logger.Error("image job item failed update failed", "item_id", itemID, "error", err)
		return
	}
	if !ok {
		p.logger.Error("image job item failed update did not match lock", "item_id", itemID)
		return
	}
	p.logger.Info("image job item simulation failed", "item_id", itemID)
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
