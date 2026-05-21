package jobs

import (
	"context"
	"testing"
	"time"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/provider"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
)

func TestRenderModeClaimsAllSupportedProviderTypes(t *testing.T) {
	store := &claimCaptureStore{}
	processor, err := NewProcessor(ProcessorConfig{
		Store:                      store,
		Mode:                       ModeRender,
		WorkerName:                 "worker-1",
		Concurrency:                1,
		ProviderConcurrencyDefault: 1,
		OwnerConcurrency:           1,
		ModelConcurrencyDefault:    1,
		PollInterval:               time.Second,
		LeaseSeconds:               30,
		HeartbeatInterval:          time.Second,
		SimulateDuration:           time.Second,
		RenderTimeout:              time.Second,
		RendererFactory:            staticRendererFactory{},
		AssetStorage:               noopAssetStorage{},
	})
	if err != nil {
		t.Fatalf("NewProcessor returned error: %v", err)
	}

	if err := processor.claimAndStart(context.Background()); err != nil {
		t.Fatalf("claimAndStart returned error: %v", err)
	}

	want := provider.SupportedRenderProviderTypes()
	if !sameStrings(store.claim.SupportedProviderTypes, want) {
		t.Fatalf("supported types = %#v, want %#v", store.claim.SupportedProviderTypes, want)
	}
	if store.claim.OwnerConcurrency != 1 {
		t.Fatalf("owner concurrency = %d, want 1", store.claim.OwnerConcurrency)
	}
}

type claimCaptureStore struct {
	claim ClaimRequest
}

func (s *claimCaptureStore) ClaimQueued(_ context.Context, request ClaimRequest) ([]int64, error) {
	s.claim = request
	return nil, nil
}

func (s *claimCaptureStore) Heartbeat(context.Context, LeaseRequest) (bool, error) {
	return false, nil
}

func (s *claimCaptureStore) MarkSucceeded(context.Context, JobLock) (bool, error) {
	return false, nil
}

func (s *claimCaptureStore) MarkFailed(context.Context, FailRequest) (bool, error) {
	return false, nil
}

func (s *claimCaptureStore) LoadJobContext(context.Context, JobLock) (*provider.JobContext, error) {
	return nil, nil
}

func (s *claimCaptureStore) CompleteRenderedJob(context.Context, CompleteRenderRequest) error {
	return nil
}

func (s *claimCaptureStore) HandleRenderFailure(context.Context, RenderFailureRequest) (RenderFailureResult, error) {
	return RenderFailureResult{}, nil
}

type staticRendererFactory struct{}

func (f staticRendererFactory) RendererFor(provider.JobContext) (provider.Renderer, error) {
	return &countingRenderer{}, nil
}

type noopAssetStorage struct{}

func (s noopAssetStorage) ReadBytes(string) ([]byte, error)        { return nil, nil }
func (s noopAssetStorage) WriteBytes(string, []byte, string) error { return nil }
func (s noopAssetStorage) WriteTemp([]byte, string) (storage.TempObject, error) {
	return storage.TempObject{Key: "staging/worker-go/noop.tmp"}, nil
}
func (s noopAssetStorage) CommitTemp(storage.TempObject, string) error { return nil }
func (s noopAssetStorage) Exists(string) bool                          { return true }
func (s noopAssetStorage) Delete(string) error                         { return nil }

func sameStrings(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}
