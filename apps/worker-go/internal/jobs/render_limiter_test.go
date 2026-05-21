package jobs

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/provider"
)

func TestProviderLimiterLimitsConcurrentRenderCalls(t *testing.T) {
	processor := newLimiterTestProcessor(t, 1, nil, 10)
	renderer := &blockingRenderer{entered: make(chan struct{}, 2), release: make(chan struct{})}
	job := limiterJob("openrouter", provider.OpenRouterChatImageType, "model-a")

	firstDone := startRenderResult(processor, renderer, job)
	waitRenderEntry(t, renderer.entered)
	secondDone := startRenderResult(processor, renderer, job)
	assertNoRenderEntry(t, renderer.entered)
	close(renderer.release)

	assertRenderDone(t, firstDone)
	assertRenderDone(t, secondDone)
}

func TestProviderLimiterUsesTypeOverrideAsSharedKey(t *testing.T) {
	processor := newLimiterTestProcessor(t, 10, map[string]int{provider.OpenRouterChatImageType: 1}, 10)
	renderer := &blockingRenderer{entered: make(chan struct{}, 2), release: make(chan struct{})}
	firstJob := limiterJob("openrouter-a", provider.OpenRouterChatImageType, "model-a")
	secondJob := limiterJob("openrouter-b", provider.OpenRouterChatImageType, "model-b")

	firstDone := startRenderResult(processor, renderer, firstJob)
	waitRenderEntry(t, renderer.entered)
	secondDone := startRenderResult(processor, renderer, secondJob)
	assertNoRenderEntry(t, renderer.entered)
	close(renderer.release)

	assertRenderDone(t, firstDone)
	assertRenderDone(t, secondDone)
}

func TestModelLimiterLimitsConcurrentRenderCalls(t *testing.T) {
	processor := newLimiterTestProcessor(t, 10, nil, 1)
	renderer := &blockingRenderer{entered: make(chan struct{}, 2), release: make(chan struct{})}
	job := limiterJob("openrouter-a", provider.OpenRouterChatImageType, "shared-model")

	firstDone := startRenderResult(processor, renderer, job)
	waitRenderEntry(t, renderer.entered)
	secondDone := startRenderResult(processor, renderer, job)
	assertNoRenderEntry(t, renderer.entered)
	close(renderer.release)

	assertRenderDone(t, firstDone)
	assertRenderDone(t, secondDone)
}

func TestLimiterReleasesWhenContextCancels(t *testing.T) {
	processor := newLimiterTestProcessor(t, 1, nil, 10)
	renderer := &blockingRenderer{entered: make(chan struct{}, 1), release: make(chan struct{})}
	job := limiterJob("openrouter", provider.OpenRouterChatImageType, "model-a")
	ctx, cancel := context.WithCancel(context.Background())
	firstDone := make(chan error, 1)
	go func() {
		_, err := processor.renderResults(ctx, renderer, job)
		firstDone <- err
	}()
	waitRenderEntry(t, renderer.entered)
	cancel()
	err := <-firstDone
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("first render error = %v, want context.Canceled", err)
	}
	ctx2, cancel2 := context.WithTimeout(context.Background(), time.Second)
	defer cancel2()

	_, err = processor.renderResults(ctx2, &countingRenderer{}, job)

	if err != nil {
		t.Fatalf("second render returned error after canceled render released limiter: %v", err)
	}
}

func newLimiterTestProcessor(
	t *testing.T,
	providerLimit int,
	providerOverrides map[string]int,
	modelLimit int,
) *Processor {
	t.Helper()
	processor, err := NewProcessor(ProcessorConfig{
		Store:                        &claimCaptureStore{},
		Mode:                         ModeRender,
		WorkerName:                   "worker-1",
		Concurrency:                  2,
		ProviderConcurrencyDefault:   providerLimit,
		ProviderConcurrencyOverrides: providerOverrides,
		OwnerConcurrency:             1,
		ModelConcurrencyDefault:      modelLimit,
		PollInterval:                 time.Second,
		LeaseSeconds:                 30,
		HeartbeatInterval:            time.Second,
		SimulateDuration:             time.Second,
		RenderTimeout:                time.Second,
		RendererFactory:              staticRendererFactory{},
		AssetStorage:                 noopAssetStorage{},
	})
	if err != nil {
		t.Fatalf("NewProcessor returned error: %v", err)
	}
	return processor
}

func startRenderResult(processor *Processor, renderer provider.Renderer, job provider.JobContext) <-chan error {
	done := make(chan error, 1)
	go func() {
		_, err := processor.renderResults(context.Background(), renderer, job)
		done <- err
	}()
	return done
}

func limiterJob(providerName string, providerType string, model string) provider.JobContext {
	return provider.JobContext{
		ID:            99,
		ItemID:        100,
		ResultIndex:   1,
		ProviderModel: model,
		Provider: provider.ProviderConfig{
			Name:   providerName,
			Type:   providerType,
			Status: "active",
		},
	}
}

type blockingRenderer struct {
	entered chan struct{}
	release chan struct{}
}

func (r *blockingRenderer) Render(ctx context.Context, _ provider.JobContext) (*provider.RenderedImage, error) {
	r.entered <- struct{}{}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-r.release:
		return &provider.RenderedImage{Content: []byte("image"), MimeType: "image/png"}, nil
	}
}

func waitRenderEntry(t *testing.T, entered <-chan struct{}) {
	t.Helper()
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("renderer did not enter")
	}
}

func assertNoRenderEntry(t *testing.T, entered <-chan struct{}) {
	t.Helper()
	select {
	case <-entered:
		t.Fatal("renderer entered while limiter should block it")
	case <-time.After(50 * time.Millisecond):
	}
}

func assertRenderDone(t *testing.T, done <-chan error) {
	t.Helper()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("render returned error: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("render did not finish")
	}
}
