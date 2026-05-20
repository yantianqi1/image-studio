package jobs

import (
	"context"
	"testing"

	"github.com/yantianqi1/image-studio/apps/worker-go/internal/provider"
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
	processor := &Processor{}

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
