package workercontrol

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

func TestRegisterWorkerCreatesRunningNode(t *testing.T) {
	store := newFakeStore()
	now := time.Date(2026, 5, 22, 10, 0, 0, 0, time.UTC)

	node, err := RegisterWorker(context.Background(), store, RegisterWorkerRequest{
		ID: "worker-1", WorkerName: "image-worker-a", Hostname: "host-a",
		Version: "test", Mode: "render", Concurrency: 4, Now: now,
		Metadata: map[string]any{"zone": "local"},
	})

	if err != nil {
		t.Fatalf("RegisterWorker returned error: %v", err)
	}
	if node.ID != "worker-1" || node.Status != WorkerStatusRunning {
		t.Fatalf("unexpected node: %+v", node)
	}
	if !node.StartedAt.Equal(now) || !node.LastHeartbeatAt.Equal(now) {
		t.Fatalf("unexpected timestamps: %+v", node)
	}
	if store.events[0].EventType != OpsEventWorkerRegistered {
		t.Fatalf("unexpected event: %+v", store.events[0])
	}
}

func TestHeartbeatWorkerUpdatesTimestampAndReturnsDrainingStatus(t *testing.T) {
	store := newFakeStore()
	store.node = WorkerNode{ID: "worker-1", Status: WorkerStatusDraining}
	now := time.Date(2026, 5, 22, 10, 1, 0, 0, time.UTC)

	node, err := HeartbeatWorker(context.Background(), store, HeartbeatRequest{ID: "worker-1", Now: now})

	if err != nil {
		t.Fatalf("HeartbeatWorker returned error: %v", err)
	}
	if node.Status != WorkerStatusDraining {
		t.Fatalf("status = %q, want draining", node.Status)
	}
	if !node.LastHeartbeatAt.Equal(now) {
		t.Fatalf("heartbeat = %s, want %s", node.LastHeartbeatAt, now)
	}
}

func TestResumeWorkerMarksNodeRunning(t *testing.T) {
	store := newFakeStore()
	store.node = WorkerNode{ID: "worker-1", Status: WorkerStatusDraining}

	node, err := ResumeWorker(context.Background(), store, "worker-1")

	if err != nil {
		t.Fatalf("ResumeWorker returned error: %v", err)
	}
	if node.Status != WorkerStatusRunning {
		t.Fatalf("status = %q, want running", node.Status)
	}
	if store.events[len(store.events)-1].EventType != OpsEventWorkerResumed {
		t.Fatalf("unexpected event: %+v", store.events)
	}
}

func TestRuntimeConfigParsesDynamicOverrides(t *testing.T) {
	store := newFakeStore()
	drain := true
	store.configJSON = mustJSON(t, map[string]any{
		"concurrency":                  6,
		"poll_interval_seconds":        3,
		"provider_concurrency_default": 5,
		"drain":                        drain,
	})

	config, found, err := LoadRuntimeConfig(context.Background(), store, "worker-go")

	if err != nil {
		t.Fatalf("LoadRuntimeConfig returned error: %v", err)
	}
	if !found {
		t.Fatal("expected runtime config to be found")
	}
	if *config.Concurrency != 6 || *config.PollIntervalSeconds != 3 {
		t.Fatalf("unexpected config: %+v", config)
	}
	if *config.ProviderConcurrencyDefault != 5 || *config.Drain != drain {
		t.Fatalf("unexpected config: %+v", config)
	}
}

func TestRuntimeConfigRejectsUnknownFields(t *testing.T) {
	store := newFakeStore()
	store.configJSON = mustJSON(t, map[string]any{"drainn": true})

	_, _, err := LoadRuntimeConfig(context.Background(), store, "worker-go")

	if err == nil {
		t.Fatal("expected unknown runtime config field to fail")
	}
}

func TestUpdateRuntimeConfigRejectsInvalidValues(t *testing.T) {
	store := newFakeStore()
	zero := 0

	_, err := UpdateRuntimeConfig(context.Background(), store, UpdateRuntimeConfigRequest{
		ConfigKey: "worker-go",
		Config:    RuntimeConfig{Concurrency: &zero},
		Now:       time.Date(2026, 5, 22, 10, 2, 0, 0, time.UTC),
	})

	if err == nil {
		t.Fatal("expected invalid runtime config to fail")
	}
	if len(store.configJSON) != 0 {
		t.Fatalf("invalid config was persisted: %s", store.configJSON)
	}
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal fixture: %v", err)
	}
	return raw
}

type fakeStore struct {
	node       WorkerNode
	configJSON []byte
	events     []OpsEvent
}

func newFakeStore() *fakeStore {
	return &fakeStore{node: WorkerNode{ID: "worker-1"}}
}

func (s *fakeStore) UpsertWorker(_ context.Context, request RegisterWorkerRequest) (WorkerNode, error) {
	s.node = WorkerNode{
		ID: request.ID, WorkerName: request.WorkerName, Hostname: request.Hostname,
		Version: request.Version, Status: WorkerStatusRunning, Mode: request.Mode,
		Concurrency: request.Concurrency, StartedAt: request.Now,
		LastHeartbeatAt: request.Now, Metadata: request.Metadata,
	}
	return s.node, nil
}

func (s *fakeStore) UpdateHeartbeat(_ context.Context, request HeartbeatRequest) (WorkerNode, error) {
	s.node.LastHeartbeatAt = request.Now
	return s.node, nil
}

func (s *fakeStore) UpdateStatus(_ context.Context, request StatusRequest) (WorkerNode, error) {
	s.node.Status = request.Status
	return s.node, nil
}

func (s *fakeStore) GetWorker(context.Context, string) (WorkerNode, error) {
	return s.node, nil
}

func (s *fakeStore) ListWorkers(context.Context) ([]WorkerNode, error) {
	return []WorkerNode{s.node}, nil
}

func (s *fakeStore) LoadRuntimeConfigValue(context.Context, string) ([]byte, bool, error) {
	return s.configJSON, len(s.configJSON) > 0, nil
}

func (s *fakeStore) UpsertRuntimeConfig(_ context.Context, request RuntimeConfigRecord) error {
	s.configJSON = append([]byte(nil), request.Value...)
	return nil
}

func (s *fakeStore) InsertOpsEvent(_ context.Context, event OpsEvent) error {
	s.events = append(s.events, event)
	return nil
}
