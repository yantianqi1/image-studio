package jobs

import (
	"context"
	"testing"
	"time"
)

func TestDrainingProcessorDoesNotClaimNewItems(t *testing.T) {
	store := &drainAwareStore{}
	processor := newControlTestProcessor(t, store, staticControl{
		snapshot: ControlSnapshot{
			Drain: true, Concurrency: 1, PollInterval: time.Second,
			ProviderConcurrencyDefault: 1,
		},
	})

	if err := processor.claimAndStart(context.Background()); err != nil {
		t.Fatalf("claimAndStart returned error: %v", err)
	}

	if store.claims != 0 {
		t.Fatalf("claims = %d, want 0 while draining", store.claims)
	}
}

func TestRuntimeControlOverridesClaimLimit(t *testing.T) {
	store := &drainAwareStore{}
	processor := newControlTestProcessor(t, store, staticControl{
		snapshot: ControlSnapshot{
			Drain: false, Concurrency: 3, PollInterval: time.Second,
			ProviderConcurrencyDefault: 1,
		},
	})

	if err := processor.claimAndStart(context.Background()); err != nil {
		t.Fatalf("claimAndStart returned error: %v", err)
	}

	if store.lastLimit != 3 {
		t.Fatalf("claim limit = %d, want runtime concurrency 3", store.lastLimit)
	}
}

func TestSimulationModeFailsInsteadOfFakeSuccess(t *testing.T) {
	store := &simulationResultStore{}
	processor := newControlTestProcessor(t, store, staticControl{
		snapshot: ControlSnapshot{
			Drain: false, Concurrency: 1, PollInterval: time.Second,
			ProviderConcurrencyDefault: 1,
		},
	})

	processor.finishSimulation(context.Background(), 42)

	if store.succeeded {
		t.Fatal("simulation mode must not mark generated output as succeeded")
	}
	if !store.failed {
		t.Fatal("simulation mode should expose failure instead of fake success")
	}
}

func newControlTestProcessor(t *testing.T, store Store, control ControlSource) *Processor {
	t.Helper()
	processor, err := NewProcessor(ProcessorConfig{
		Store: store, WorkerName: "worker-1", Concurrency: 1,
		ProviderConcurrencyDefault: 1, OwnerConcurrency: 1,
		AnonymousOwnerConcurrency: 1, ModelConcurrencyDefault: 1,
		PollInterval: time.Second, LeaseSeconds: 30,
		HeartbeatInterval: time.Second, SimulateDuration: time.Second,
		ProviderCircuitFailureThreshold: 1, ProviderCircuitOpenSeconds: 1,
		ControlSource: control,
	})
	if err != nil {
		t.Fatalf("NewProcessor returned error: %v", err)
	}
	return processor
}

type staticControl struct {
	snapshot ControlSnapshot
}

func (s staticControl) Snapshot() ControlSnapshot {
	return s.snapshot
}

type drainAwareStore struct {
	claimCaptureStore
	claims    int
	lastLimit int
}

func (s *drainAwareStore) ClaimQueued(_ context.Context, request ClaimRequest) ([]int64, error) {
	s.claims++
	s.lastLimit = request.Limit
	return nil, nil
}

type simulationResultStore struct {
	claimCaptureStore
	succeeded bool
	failed    bool
}

func (s *simulationResultStore) MarkSucceeded(context.Context, JobLock) (bool, error) {
	s.succeeded = true
	return true, nil
}

func (s *simulationResultStore) MarkFailed(context.Context, FailRequest) (bool, error) {
	s.failed = true
	return true, nil
}
