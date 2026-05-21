package provider

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOpenAICompatibleRendererBuildsGenerationRequest(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString([]byte("generated-png"))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/images/generations" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		assertAuthHeader(t, r, "Bearer sk-openai")
		payload := decodeJSONRequest(t, r)
		assertStringField(t, payload, "model", "gpt-image-2")
		assertStringField(t, payload, "prompt", "生成海报")
		assertStringField(t, payload, "size", "1024x1024")
		assertStringField(t, payload, "quality", "high")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"` + encoded + `"}]}`))
	}))
	defer server.Close()

	renderer := NewOpenAICompatibleRenderer(OpenAICompatibleRendererConfig{
		HTTPClient: server.Client(),
		LookupEnv:  lookupEnv("OPENAI_PROVIDER_KEY", "sk-openai"),
	})
	rendered, err := renderer.Render(context.Background(), JobContext{
		Prompt:        "生成海报",
		ProviderModel: "gpt-image-2",
		Size:          "1024x1024",
		Quality:       "high",
		Provider:      activeProvider(OpenAICompatibleType, server.URL+"/v1", "OPENAI_PROVIDER_KEY"),
	})

	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}
	if string(rendered.Content) != "generated-png" || rendered.MimeType != "image/png" {
		t.Fatalf("rendered = %q %q", string(rendered.Content), rendered.MimeType)
	}
}

func TestOpenAICompatibleRendererBuildsEditMultipartRequest(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString([]byte("edited-png"))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/images/edits" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		assertAuthHeader(t, r, "Bearer sk-openai")
		if !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			t.Fatalf("unexpected content type %q", r.Header.Get("Content-Type"))
		}
		reader, err := r.MultipartReader()
		if err != nil {
			t.Fatalf("MultipartReader: %v", err)
		}
		assertEditMultipart(t, reader)
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"` + encoded + `"}]}`))
	}))
	defer server.Close()

	renderer := NewOpenAICompatibleRenderer(OpenAICompatibleRendererConfig{
		HTTPClient: server.Client(),
		LookupEnv:  lookupEnv("OPENAI_PROVIDER_KEY", "sk-openai"),
		Storage:    MemoryAssetStorage{Content: map[string][]byte{"refs/ref.png": []byte("reference")}},
	})
	_, err := renderer.Render(context.Background(), JobContext{
		Prompt:          "按参考图重绘",
		ProviderModel:   "gpt-image-2",
		ReferenceAssets: []AssetRef{{ID: 7, StoragePath: "refs/ref.png", MimeType: "image/png"}},
		Provider:        activeProvider(OpenAICompatibleType, server.URL+"/v1", "OPENAI_PROVIDER_KEY"),
	})

	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}
}

func TestOpenRouterChatImageRendererBuildsRequestAndParsesUsage(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString([]byte("router-png"))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		assertAuthHeader(t, r, "Bearer sk-openrouter")
		payload := decodeJSONRequest(t, r)
		assertOpenRouterPayload(t, payload)
		_, _ = w.Write([]byte(`{
			"choices":[{"message":{"images":[{"image_url":{"url":"data:image/png;base64,` + encoded + `"}}]}}],
			"usage":{
				"prompt_tokens":11,
				"completion_tokens":13,
				"total_tokens":24,
				"cost":0.0123,
				"cost_details":{"upstream_inference_cost":0.01}
			}
		}`))
	}))
	defer server.Close()

	renderer := NewOpenRouterChatImageRenderer(OpenRouterChatImageRendererConfig{
		HTTPClient: server.Client(),
		LookupEnv:  lookupEnv("OPENROUTER_KEY", "sk-openrouter"),
		Storage:    MemoryAssetStorage{Content: map[string][]byte{"refs/router.png": []byte("router-ref")}},
	})
	rendered, err := renderer.Render(context.Background(), JobContext{
		Prompt:          "生成商品图",
		ProviderModel:   "openai/gpt-image-2",
		Size:            "1344x768",
		Quality:         "high",
		Provider:        activeProvider(OpenRouterChatImageType, server.URL+"/v1", "OPENROUTER_KEY"),
		ReferenceAssets: []AssetRef{{ID: 3, StoragePath: "refs/router.png", MimeType: "image/png"}},
	})

	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}
	if string(rendered.Content) != "router-png" {
		t.Fatalf("rendered content = %q", string(rendered.Content))
	}
	assertUsage(t, rendered.Usage)
}

func TestProviderErrorResponseRedactsAPIKeyAndBase64(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"bad key sk-secret-token data:image/png;base64,AAAABBBB"}}`))
	}))
	defer server.Close()

	renderer := NewOpenAICompatibleRenderer(OpenAICompatibleRendererConfig{
		HTTPClient: server.Client(),
		LookupEnv:  lookupEnv("OPENAI_PROVIDER_KEY", "sk-secret-token"),
	})
	_, err := renderer.Render(context.Background(), JobContext{
		Prompt:        "生成海报",
		ProviderModel: "gpt-image-2",
		Provider:      activeProvider(OpenAICompatibleType, server.URL+"/v1", "OPENAI_PROVIDER_KEY"),
	})

	assertRenderErrorCode(t, err, "provider_request_failed")
	if strings.Contains(err.Error(), "sk-secret-token") {
		t.Fatalf("error leaked api key: %v", err)
	}
	if strings.Contains(err.Error(), "AAAABBBB") {
		t.Fatalf("error leaked base64 image data: %v", err)
	}
	if !strings.Contains(err.Error(), "[redacted]") {
		t.Fatalf("error did not include redaction marker: %v", err)
	}
}

func activeProvider(providerType string, baseURL string, apiKeyEnv string) ProviderConfig {
	return ProviderConfig{
		Name:      "test-provider",
		Type:      providerType,
		BaseURL:   baseURL,
		APIKeyEnv: apiKeyEnv,
		Status:    "active",
	}
}

func lookupEnv(key string, value string) LookupFunc {
	return func(candidate string) (string, bool) {
		if candidate != key {
			return "", false
		}
		return value, true
	}
}

func assertAuthHeader(t *testing.T, r *http.Request, want string) {
	t.Helper()
	if r.Header.Get("Authorization") != want {
		t.Fatalf("Authorization = %q, want %q", r.Header.Get("Authorization"), want)
	}
}

func decodeJSONRequest(t *testing.T, r *http.Request) map[string]any {
	t.Helper()
	var payload map[string]any
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	return payload
}

func assertStringField(t *testing.T, payload map[string]any, key string, want string) {
	t.Helper()
	if payload[key] != want {
		t.Fatalf("%s = %#v, want %q", key, payload[key], want)
	}
}

func assertEditMultipart(t *testing.T, reader *multipart.Reader) {
	t.Helper()
	seen := map[string]string{}
	for {
		part, err := reader.NextPart()
		if err != nil {
			break
		}
		content := readPart(t, part)
		seen[part.FormName()] = content
	}
	if seen["model"] != "gpt-image-2" || seen["prompt"] != "按参考图重绘" {
		t.Fatalf("unexpected multipart fields %#v", seen)
	}
	if seen["image"] != "reference" {
		t.Fatalf("unexpected image multipart content %#v", seen)
	}
}

func readPart(t *testing.T, part *multipart.Part) string {
	t.Helper()
	buf := new(strings.Builder)
	if _, err := io.Copy(buf, part); err != nil {
		t.Fatalf("read part: %v", err)
	}
	return buf.String()
}

func assertOpenRouterPayload(t *testing.T, payload map[string]any) {
	t.Helper()
	assertStringField(t, payload, "model", "openai/gpt-image-2")
	assertStringSlice(t, payload["modalities"], []string{"image", "text"})
	config := payload["image_config"].(map[string]any)
	assertStringField(t, config, "aspect_ratio", "16:9")
	assertStringField(t, config, "image_size", "4K")
	messages := payload["messages"].([]any)
	content := messages[0].(map[string]any)["content"].([]any)
	text := content[0].(map[string]any)["text"].(string)
	if text != "生成商品图" {
		t.Fatalf("OpenRouter prompt = %q, want raw prompt without hints", text)
	}
	imageURL := content[1].(map[string]any)["image_url"].(map[string]any)["url"].(string)
	if !strings.HasPrefix(imageURL, "data:image/png;base64,") {
		t.Fatalf("unexpected image url %q", imageURL)
	}
}

func assertStringSlice(t *testing.T, value any, want []string) {
	t.Helper()
	items, ok := value.([]any)
	if !ok || len(items) != len(want) {
		t.Fatalf("slice = %#v, want %#v", value, want)
	}
	for i, item := range items {
		if item != want[i] {
			t.Fatalf("slice[%d] = %#v, want %q", i, item, want[i])
		}
	}
}

func assertUsage(t *testing.T, usage *Usage) {
	t.Helper()
	if usage == nil {
		t.Fatal("usage is nil")
	}
	assertInt64Pointer(t, usage.InputTokens, 11)
	assertInt64Pointer(t, usage.OutputTokens, 13)
	assertInt64Pointer(t, usage.TotalTokens, 24)
	assertInt64Pointer(t, usage.InternalCostCents, 2)
	assertInt64Pointer(t, usage.RawProviderCostCents, 1)
	assertInt64Pointer(t, usage.ProviderFeeCents, 1)
}

func assertInt64Pointer(t *testing.T, got *int64, want int64) {
	t.Helper()
	if got == nil || *got != want {
		t.Fatalf("value = %v, want %d", got, want)
	}
}
