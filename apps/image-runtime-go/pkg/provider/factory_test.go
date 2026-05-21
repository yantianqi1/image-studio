package provider

import (
	"context"
	"encoding/base64"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func TestFactoryRendererForSupportedProviderTypes(t *testing.T) {
	factory := NewFactory(FactoryConfig{})
	tests := []struct {
		name         string
		providerType string
		wantType     any
	}{
		{name: "openai-compatible", providerType: OpenAICompatibleType, wantType: &OpenAICompatibleRenderer{}},
		{name: "openai-chat-compatible", providerType: OpenAIChatCompatibleType, wantType: &OpenAIChatRenderer{}},
		{name: "openrouter-chat-image", providerType: OpenRouterChatImageType, wantType: &OpenRouterChatImageRenderer{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			renderer, err := factory.RendererFor(activeJob(tt.providerType))
			if err != nil {
				t.Fatalf("RendererFor returned error: %v", err)
			}
			if reflect.TypeOf(renderer) != reflect.TypeOf(tt.wantType) {
				t.Fatalf("renderer type = %T, want %T", renderer, tt.wantType)
			}
		})
	}
}

func TestFactoryReturnsProviderNotActiveBeforeClientProviderUnsupported(t *testing.T) {
	factory := NewFactory(FactoryConfig{})
	job := activeJob(OpenAICompatibleType)
	job.ClientProviderConfigRaw = `{"apiKey":"sk-user"}`
	job.Provider.Status = "disabled"

	_, err := factory.RendererFor(job)

	assertRenderErrorCode(t, err, "provider_not_active")
}

func TestFactoryBuildsClientProviderRenderer(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString([]byte("client-png"))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/images/generations" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer sk-client-secret" {
			t.Fatalf("Authorization = %q", r.Header.Get("Authorization"))
		}
		payload := decodeJSONRequest(t, r)
		assertStringField(t, payload, "model", "client-image-model")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"` + encoded + `"}]}`))
	}))
	defer server.Close()

	factory := NewFactory(FactoryConfig{HTTPClient: server.Client()})
	job := activeJob(OpenAICompatibleType)
	job.ClientProviderConfigRaw = `{
		"client_id":"browser-1",
		"api_key":"sk-client-secret",
		"provider_type":"openai-compatible",
		"base_url":"` + server.URL + `/v1",
		"provider_model":"client-image-model"
	}`

	renderer, err := factory.RendererFor(job)
	if err != nil {
		t.Fatalf("RendererFor returned error: %v", err)
	}
	rendered, err := renderer.Render(context.Background(), job)

	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}
	if string(rendered.Content) != "client-png" {
		t.Fatalf("rendered content = %q", string(rendered.Content))
	}
}

func TestFactoryRejectsInvalidClientProviderConfig(t *testing.T) {
	factory := NewFactory(FactoryConfig{})
	job := activeJob(OpenAICompatibleType)
	job.ClientProviderConfigRaw = `{"api_key":`

	_, err := factory.RendererFor(job)

	assertNonRetryableRenderError(t, err, "client_provider_config_invalid")
}

func TestFactoryRejectsClientProviderConfigWithoutAPIKey(t *testing.T) {
	factory := NewFactory(FactoryConfig{})
	job := activeJob(OpenAICompatibleType)
	job.ClientProviderConfigRaw = `{"client_id":"browser-1","provider_type":"openai-compatible","base_url":"https://client.test/v1"}`

	_, err := factory.RendererFor(job)

	assertNonRetryableRenderError(t, err, "provider_api_key_missing")
}

func TestClientProviderErrorRedactsAPIKey(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"bad key sk-client-secret"}}`))
	}))
	defer server.Close()

	factory := NewFactory(FactoryConfig{HTTPClient: server.Client()})
	job := activeJob(OpenAICompatibleType)
	job.ClientProviderConfigRaw = `{
		"client_id":"browser-1",
		"api_key":"sk-client-secret",
		"provider_type":"openai-compatible",
		"base_url":"` + server.URL + `/v1"
	}`
	renderer, err := factory.RendererFor(job)
	if err != nil {
		t.Fatalf("RendererFor returned error: %v", err)
	}

	_, err = renderer.Render(context.Background(), job)

	assertRenderErrorCode(t, err, "provider_request_failed")
	if strings.Contains(err.Error(), "sk-client-secret") {
		t.Fatalf("error leaked api key: %v", err)
	}
}

func TestFactoryReturnsProviderTypeUnsupported(t *testing.T) {
	factory := NewFactory(FactoryConfig{})

	_, err := factory.RendererFor(activeJob("client_provider_config"))

	assertRenderErrorCode(t, err, "provider_type_unsupported")
}

func TestSupportedRenderProviderTypes(t *testing.T) {
	got := SupportedRenderProviderTypes()
	want := []string{OpenAICompatibleType, OpenAIChatCompatibleType, OpenRouterChatImageType}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("SupportedRenderProviderTypes() = %#v, want %#v", got, want)
	}
}

func activeJob(providerType string) JobContext {
	return JobContext{
		ID:            99,
		Prompt:        "render this",
		ProviderModel: "model-1",
		Provider: ProviderConfig{
			Name:      "test-provider",
			Type:      providerType,
			BaseURL:   "https://provider.test/v1",
			APIKeyEnv: "PROVIDER_KEY",
			Status:    "active",
		},
	}
}

func assertRenderErrorCode(t *testing.T, err error, code string) {
	t.Helper()
	var renderErr *RenderError
	if !errors.As(err, &renderErr) {
		t.Fatalf("error = %v, want RenderError", err)
	}
	if renderErr.Code != code {
		t.Fatalf("error code = %q, want %q", renderErr.Code, code)
	}
}

func assertNonRetryableRenderError(t *testing.T, err error, code string) {
	t.Helper()
	assertRenderErrorCode(t, err, code)
	if !IsNonRetryable(err) {
		t.Fatalf("error should be non-retryable: %v", err)
	}
}
