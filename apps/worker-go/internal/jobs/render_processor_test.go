package jobs

import (
	"context"
	"testing"
	"time"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/imagejob"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/observability"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/provider"
)

type countingRenderer struct {
	calls int
}

func (r *countingRenderer) Render(context.Context, provider.JobContext) (*provider.RenderedImage, error) {
	r.calls++
	return &provider.RenderedImage{Content: []byte("image"), MimeType: "image/png"}, nil
}

func TestRenderResultsRendersOnlyCurrentItem(t *testing.T) {
	renderer := &countingRenderer{}
	processor := &Processor{
		providerConcurrencyDefault: 1,
		modelConcurrencyDefault:    1,
		providerLimiter:            newLimiterPool(),
		modelLimiter:               newLimiterPool(),
		metrics:                    observability.NewMetrics(),
	}

	results, err := processor.renderResults(context.Background(), renderer, provider.JobContext{
		ItemID:         10,
		ID:             20,
		ResultIndex:    2,
		RequestedCount: 4,
	})

	if err != nil {
		t.Fatalf("renderResults returned error: %v", err)
	}
	if renderer.calls != 1 {
		t.Fatalf("renderer called %d times, want 1", renderer.calls)
	}
	if len(results) != 1 {
		t.Fatalf("got %d results, want 1", len(results))
	}
}

func TestRetryBackoffSecondsUsesAttemptCountAndCap(t *testing.T) {
	cases := []struct {
		name         string
		attemptCount int
		baseSeconds  int
		maxSeconds   int
		want         int
	}{
		{name: "first retry", attemptCount: 1, baseSeconds: 5, maxSeconds: 300, want: 5},
		{name: "third retry", attemptCount: 3, baseSeconds: 5, maxSeconds: 300, want: 20},
		{name: "capped", attemptCount: 8, baseSeconds: 5, maxSeconds: 300, want: 300},
		{name: "defaults", attemptCount: 2, baseSeconds: 0, maxSeconds: 0, want: 10},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := imagejob.RetryBackoffSeconds(tc.attemptCount, tc.baseSeconds, tc.maxSeconds)

			if got != tc.want {
				t.Fatalf("got %d, want %d", got, tc.want)
			}
		})
	}
}

func TestProviderRequestFailureTracksSystemProviderCircuit(t *testing.T) {
	store := &claimCaptureStore{failureOutcome: RenderFailureResult{Updated: true, Retried: true}}
	processor := newRenderFailureTestProcessor(t, store)
	err := provider.NewError("provider_request_failed", "upstream 502", false)
	job := provider.JobContext{Provider: provider.ProviderConfig{ID: 7}}

	processor.handleRenderFailure(context.Background(), 99, &job, err)

	if store.failure.ProviderCircuit == nil {
		t.Fatal("expected provider circuit update")
	}
	if store.failure.ProviderCircuit.ProviderID != 7 {
		t.Fatalf("provider id = %d, want 7", store.failure.ProviderCircuit.ProviderID)
	}
	if store.failure.ProviderCircuit.FailureThreshold != 3 {
		t.Fatalf("threshold = %d, want 3", store.failure.ProviderCircuit.FailureThreshold)
	}
	if store.failure.ProviderCircuit.OpenSeconds != 120 {
		t.Fatalf("open seconds = %d, want 120", store.failure.ProviderCircuit.OpenSeconds)
	}
}

func TestClientProviderRequestFailureDoesNotTrackSharedProviderCircuit(t *testing.T) {
	store := &claimCaptureStore{failureOutcome: RenderFailureResult{Updated: true, Retried: true}}
	processor := newRenderFailureTestProcessor(t, store)
	err := provider.NewError("provider_request_failed", "user key failed", false)
	job := provider.JobContext{
		ClientProviderConfigRaw: `{"api_key":"sk-user","provider_type":"openai-compatible"}`,
		Provider:                provider.ProviderConfig{ID: 7},
	}

	processor.handleRenderFailure(context.Background(), 99, &job, err)

	if store.failure.ProviderCircuit != nil {
		t.Fatalf("unexpected provider circuit update: %#v", store.failure.ProviderCircuit)
	}
}

func newRenderFailureTestProcessor(t *testing.T, store Store) *Processor {
	t.Helper()
	processor, err := NewProcessor(ProcessorConfig{
		Store: store, WorkerName: "worker-1", Concurrency: 1,
		ProviderConcurrencyDefault: 1, OwnerConcurrency: 1,
		AnonymousOwnerConcurrency: 1, ModelConcurrencyDefault: 1,
		PollInterval: time.Second, LeaseSeconds: 30,
		HeartbeatInterval: time.Second, SimulateDuration: time.Second,
		ProviderCircuitFailureThreshold: 3, ProviderCircuitOpenSeconds: 120,
	})
	if err != nil {
		t.Fatalf("NewProcessor returned error: %v", err)
	}
	return processor
}
