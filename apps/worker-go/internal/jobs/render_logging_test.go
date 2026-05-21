package jobs

import (
	"fmt"
	"strings"
	"testing"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/provider"
)

func TestRenderLogAttrsExcludePromptAndSecrets(t *testing.T) {
	job := &provider.JobContext{
		ItemID:        1,
		ID:            2,
		Prompt:        "full prompt text must not be logged",
		ProviderModel: "gpt-image-2",
		AttemptCount:  3,
		Provider: provider.ProviderConfig{
			Name:   "openrouter",
			Type:   provider.OpenRouterChatImageType,
			APIKey: "sk-secret",
		},
	}

	attrs := renderLogAttrs("worker-a", 1, job)
	flat := fmt.Sprint(attrs)

	if !strings.Contains(flat, "prompt_length") {
		t.Fatalf("log attrs missing prompt length: %#v", attrs)
	}
	for _, forbidden := range []string{"full prompt text", "sk-secret"} {
		if strings.Contains(flat, forbidden) {
			t.Fatalf("log attrs leaked %q: %#v", forbidden, attrs)
		}
	}
}
