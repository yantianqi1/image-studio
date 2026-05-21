package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
)

func TestOpenAIChatRendererBuildsChatCompletionsRequest(t *testing.T) {
	imageURL := ""
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/image.png" {
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte("png-bytes"))
			return
		}
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer sk-test" {
			t.Fatalf("unexpected authorization header %q", r.Header.Get("Authorization"))
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
		assertChatPayload(t, payload)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Request-Id", "req-go-chat-1")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"![result](` + imageURL + `)"}}]}`))
	}))
	defer server.Close()
	imageURL = server.URL + "/image.png"

	renderer := NewOpenAIChatRenderer(OpenAIChatRendererConfig{
		HTTPClient: server.Client(),
		LookupEnv: func(key string) (string, bool) {
			return map[string]string{"OPENAI_PROVIDER_KEY": "sk-test"}[key], key == "OPENAI_PROVIDER_KEY"
		},
		Storage: MemoryAssetStorage{Content: map[string][]byte{"refs/ref.png": []byte("reference")}},
	})
	rendered, err := renderer.Render(context.Background(), JobContext{
		ID:            12,
		Prompt:        "保持角色一致",
		ProviderModel: "gpt-image-2",
		Size:          "1080x1920",
		Quality:       "high",
		Provider: ProviderConfig{
			Name:      "wdapi",
			Type:      OpenAIChatCompatibleType,
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_PROVIDER_KEY",
		},
		ReferenceAssets: []AssetRef{{ID: 3, StoragePath: "refs/ref.png", MimeType: "image/png"}},
	})
	if err != nil {
		t.Fatalf("render failed: %v", err)
	}
	if string(rendered.Content) != "png-bytes" {
		t.Fatalf("unexpected rendered content %q", string(rendered.Content))
	}
	if rendered.MimeType != "image/png" {
		t.Fatalf("unexpected mime type %q", rendered.MimeType)
	}
	if rendered.ProviderRequestID == nil || *rendered.ProviderRequestID != "req-go-chat-1" {
		t.Fatalf("unexpected request id %v", rendered.ProviderRequestID)
	}
}

func assertChatPayload(t *testing.T, payload map[string]any) {
	t.Helper()
	if payload["model"] != "gpt-image-2" || payload["stream"] != true {
		t.Fatalf("unexpected model/stream payload: %#v", payload)
	}
	if payload["temperature"] != float64(0.97) || payload["max_tokens"] != float64(50000) {
		t.Fatalf("unexpected generation options: %#v", payload)
	}
	messages := payload["messages"].([]any)
	content := messages[0].(map[string]any)["content"].([]any)
	text := content[0].(map[string]any)["text"].(string)
	if !strings.Contains(text, "保持角色一致") || !strings.Contains(text, "1080 x 1920") || !strings.Contains(text, "High") {
		t.Fatalf("prompt hints missing from %q", text)
	}
	url := content[1].(map[string]any)["image_url"].(map[string]any)["url"].(string)
	if !strings.HasPrefix(url, "data:image/png;base64,") {
		t.Fatalf("unexpected image url %q", url)
	}
}

type MemoryAssetStorage struct {
	Content map[string][]byte
}

func (s MemoryAssetStorage) ReadBytes(key string) ([]byte, error) {
	content, ok := s.Content[key]
	if !ok {
		return nil, NewError("source_asset_file_missing", "source asset file missing", false)
	}
	return content, nil
}

func (s MemoryAssetStorage) WriteBytes(string, []byte, string) error { return nil }
func (s MemoryAssetStorage) WriteTemp([]byte, string) (storage.TempObject, error) {
	return storage.TempObject{Key: "staging/worker-go/memory.tmp"}, nil
}
func (s MemoryAssetStorage) CommitTemp(storage.TempObject, string) error { return nil }
func (s MemoryAssetStorage) Exists(key string) bool                      { _, ok := s.Content[key]; return ok }
func (s MemoryAssetStorage) Delete(string) error                         { return nil }
