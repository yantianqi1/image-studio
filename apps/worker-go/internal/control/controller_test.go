package control

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/observability"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/workercontrol"
)

func TestControllerRegistersRefreshesAndStopsWorker(t *testing.T) {
	store := &fakeControlStore{
		node: workercontrol.WorkerNode{ID: "worker-1", Status: workercontrol.WorkerStatusRunning},
	}
	controller := NewController(Config{
		Store: store, WorkerID: "worker-1", WorkerName: "go-worker-a",
		Hostname: "host-a", Version: "test", Mode: "render", Concurrency: 2,
		PollInterval: time.Second, ProviderConcurrencyDefault: 2,
		RuntimeConfigKey: "worker-go", Metrics: observability.NewMetrics(), Logger: slog.Default(),
	})

	if err := controller.Start(context.Background()); err != nil {
		t.Fatalf("Start returned error: %v", err)
	}
	if err := controller.RefreshOnce(context.Background()); err != nil {
		t.Fatalf("RefreshOnce returned error: %v", err)
	}
	if err := controller.Stop(context.Background()); err != nil {
		t.Fatalf("Stop returned error: %v", err)
	}

	if store.registers != 1 || store.heartbeats != 1 || store.stopped != 1 {
		t.Fatalf("unexpected store calls: %+v", store)
	}
}

func TestControllerSnapshotAppliesRuntimeConfigAndNodeDraining(t *testing.T) {
	drain := false
	concurrency := 5
	pollSeconds := 3
	providerDefault := 4
	store := &fakeControlStore{
		node: workercontrol.WorkerNode{ID: "worker-1", Status: workercontrol.WorkerStatusDraining},
		config: workercontrol.RuntimeConfig{
			Concurrency: &concurrency, PollIntervalSeconds: &pollSeconds,
			ProviderConcurrencyDefault: &providerDefault, Drain: &drain,
		},
		found: true,
	}
	controller := NewController(Config{
		Store: store, WorkerID: "worker-1", WorkerName: "go-worker-a",
		Hostname: "host-a", Version: "test", Mode: "render", Concurrency: 2,
		PollInterval: time.Second, ProviderConcurrencyDefault: 2,
		RuntimeConfigKey: "worker-go", Metrics: observability.NewMetrics(), Logger: slog.Default(),
	})

	if err := controller.Start(context.Background()); err != nil {
		t.Fatalf("Start returned error: %v", err)
	}

	snapshot := controller.Snapshot()
	if !snapshot.Drain {
		t.Fatal("expected node draining status to drain snapshot")
	}
	if snapshot.Concurrency != 5 || snapshot.PollInterval != 3*time.Second {
		t.Fatalf("unexpected snapshot: %+v", snapshot)
	}
	if snapshot.ProviderConcurrencyDefault != 4 {
		t.Fatalf("unexpected provider default: %+v", snapshot)
	}
}

func TestControllerCountsInvalidRuntimeConfigAsRefreshFailure(t *testing.T) {
	metrics := observability.NewMetrics()
	store := &fakeControlStore{
		node:       workercontrol.WorkerNode{ID: "worker-1", Status: workercontrol.WorkerStatusRunning},
		configJSON: []byte(`{"drainn":true}`),
		found:      true,
	}
	controller := NewController(Config{
		Store: store, WorkerID: "worker-1", WorkerName: "go-worker-a",
		Hostname: "host-a", Version: "test", Mode: "render", Concurrency: 2,
		PollInterval: time.Second, ProviderConcurrencyDefault: 2,
		RuntimeConfigKey: "worker-go", Metrics: metrics, Logger: slog.Default(),
	})

	err := controller.RefreshOnce(context.Background())

	if err == nil {
		t.Fatal("expected invalid runtime config refresh to fail")
	}
	if !strings.Contains(metrics.PrometheusText(), "image_worker_heartbeat_failed_total 1") {
		t.Fatalf("refresh failure did not increment metrics:\n%s", metrics.PrometheusText())
	}
}

type fakeControlStore struct {
	node       workercontrol.WorkerNode
	config     workercontrol.RuntimeConfig
	configJSON []byte
	found      bool
	registers  int
	heartbeats int
	stopped    int
}

func (s *fakeControlStore) UpsertWorker(context.Context, workercontrol.RegisterWorkerRequest) (workercontrol.WorkerNode, error) {
	s.registers++
	return s.node, nil
}

func (s *fakeControlStore) UpdateHeartbeat(context.Context, workercontrol.HeartbeatRequest) (workercontrol.WorkerNode, error) {
	s.heartbeats++
	return s.node, nil
}

func (s *fakeControlStore) UpdateStatus(_ context.Context, request workercontrol.StatusRequest) (workercontrol.WorkerNode, error) {
	if request.Status == workercontrol.WorkerStatusStopped {
		s.stopped++
	}
	s.node.Status = request.Status
	return s.node, nil
}

func (s *fakeControlStore) GetWorker(context.Context, string) (workercontrol.WorkerNode, error) {
	return s.node, nil
}

func (s *fakeControlStore) ListWorkers(context.Context) ([]workercontrol.WorkerNode, error) {
	return []workercontrol.WorkerNode{s.node}, nil
}

func (s *fakeControlStore) LoadRuntimeConfigValue(context.Context, string) ([]byte, bool, error) {
	if !s.found {
		return nil, false, nil
	}
	if len(s.configJSON) > 0 {
		return s.configJSON, true, nil
	}
	raw, err := json.Marshal(s.config)
	return raw, true, err
}

func (s *fakeControlStore) UpsertRuntimeConfig(context.Context, workercontrol.RuntimeConfigRecord) error {
	return nil
}

func (s *fakeControlStore) InsertOpsEvent(context.Context, workercontrol.OpsEvent) error {
	return nil
}

func (s *fakeControlStore) LoadRuntimeConfig(context.Context, string) (workercontrol.RuntimeConfig, bool, error) {
	return s.config, s.found, nil
}
