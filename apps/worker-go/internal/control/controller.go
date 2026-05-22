package control

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/observability"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/workercontrol"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/jobs"
)

type Config struct {
	Store                      workercontrol.Store
	WorkerID                   string
	WorkerName                 string
	Hostname                   string
	Version                    string
	Mode                       string
	Concurrency                int
	PollInterval               time.Duration
	ProviderConcurrencyDefault int
	RuntimeConfigKey           string
	Metrics                    *observability.Metrics
	Logger                     *slog.Logger
}

type Controller struct {
	cfg      Config
	mu       sync.RWMutex
	snapshot jobs.ControlSnapshot
}

func NewController(cfg Config) *Controller {
	return &Controller{cfg: cfg, snapshot: baseSnapshot(cfg)}
}

func (c *Controller) Start(ctx context.Context) error {
	if err := validateConfig(c.cfg); err != nil {
		return err
	}
	node, err := workercontrol.RegisterWorker(ctx, c.cfg.Store, c.registerRequest())
	if err != nil {
		return err
	}
	return c.applyNodeAndConfig(ctx, node)
}

func (c *Controller) Run(ctx context.Context) {
	ticker := time.NewTicker(c.cfg.PollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := c.RefreshOnce(ctx); err != nil {
				c.logger().Error("worker control refresh failed", "error", err)
			}
		}
	}
}

func (c *Controller) RefreshOnce(ctx context.Context) error {
	node, err := workercontrol.HeartbeatWorker(ctx, c.cfg.Store, workercontrol.HeartbeatRequest{ID: c.workerID()})
	if err != nil {
		c.metrics().IncHeartbeatFailed()
		return err
	}
	if err := c.applyNodeAndConfig(ctx, node); err != nil {
		c.metrics().IncHeartbeatFailed()
		return err
	}
	return nil
}

func (c *Controller) Stop(ctx context.Context) error {
	_, err := workercontrol.MarkStopped(ctx, c.cfg.Store, c.workerID())
	return err
}

func (c *Controller) Snapshot() jobs.ControlSnapshot {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.snapshot
}

func (c *Controller) applyNodeAndConfig(ctx context.Context, node workercontrol.WorkerNode) error {
	config, found, err := workercontrol.LoadRuntimeConfig(ctx, c.cfg.Store, c.runtimeConfigKey())
	if err != nil {
		return err
	}
	snapshot := baseSnapshot(c.cfg)
	if found {
		snapshot = applyRuntimeConfig(snapshot, config)
	}
	snapshot.Drain = snapshot.Drain || node.Status == workercontrol.WorkerStatusDraining
	c.setSnapshot(snapshot)
	return nil
}

func (c *Controller) setSnapshot(snapshot jobs.ControlSnapshot) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.snapshot = snapshot
}

func (c *Controller) registerRequest() workercontrol.RegisterWorkerRequest {
	return workercontrol.RegisterWorkerRequest{
		ID: c.workerID(), WorkerName: c.cfg.WorkerName, Hostname: c.cfg.Hostname,
		Version: c.cfg.Version, Mode: c.cfg.Mode, Concurrency: c.cfg.Concurrency,
		Metadata: map[string]any{"runtime_config_key": c.runtimeConfigKey()},
	}
}

func (c *Controller) workerID() string {
	if strings.TrimSpace(c.cfg.WorkerID) != "" {
		return strings.TrimSpace(c.cfg.WorkerID)
	}
	if strings.TrimSpace(c.cfg.Hostname) == "" {
		return strings.TrimSpace(c.cfg.WorkerName)
	}
	return strings.TrimSpace(c.cfg.WorkerName) + "@" + strings.TrimSpace(c.cfg.Hostname)
}

func (c *Controller) runtimeConfigKey() string {
	if strings.TrimSpace(c.cfg.RuntimeConfigKey) == "" {
		return workercontrol.DefaultRuntimeConfigKey
	}
	return strings.TrimSpace(c.cfg.RuntimeConfigKey)
}

func (c *Controller) metrics() *observability.Metrics {
	return c.cfg.Metrics
}

func (c *Controller) logger() *slog.Logger {
	if c.cfg.Logger == nil {
		return slog.Default()
	}
	return c.cfg.Logger
}

func baseSnapshot(cfg Config) jobs.ControlSnapshot {
	return jobs.ControlSnapshot{
		Concurrency: cfg.Concurrency, PollInterval: cfg.PollInterval,
		ProviderConcurrencyDefault: cfg.ProviderConcurrencyDefault,
	}
}

func applyRuntimeConfig(snapshot jobs.ControlSnapshot, config workercontrol.RuntimeConfig) jobs.ControlSnapshot {
	if config.Concurrency != nil {
		snapshot.Concurrency = *config.Concurrency
	}
	if config.PollIntervalSeconds != nil {
		snapshot.PollInterval = time.Duration(*config.PollIntervalSeconds) * time.Second
	}
	if config.ProviderConcurrencyDefault != nil {
		snapshot.ProviderConcurrencyDefault = *config.ProviderConcurrencyDefault
	}
	if config.Drain != nil {
		snapshot.Drain = *config.Drain
	}
	return snapshot
}

func validateConfig(cfg Config) error {
	if cfg.Store == nil {
		return fmt.Errorf("worker control store is required")
	}
	if strings.TrimSpace(cfg.WorkerName) == "" {
		return fmt.Errorf("worker name is required")
	}
	if cfg.Concurrency < 1 || cfg.PollInterval <= 0 || cfg.ProviderConcurrencyDefault < 1 {
		return fmt.Errorf("worker control base config must be positive")
	}
	if cfg.Metrics == nil {
		return fmt.Errorf("worker control metrics are required")
	}
	return nil
}
