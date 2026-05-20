package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/yantianqi1/image-studio/apps/worker-go/internal/storage"
)

const (
	openAIChatCompletionsEndpoint = "/chat/completions"
	chatImageTemperature          = 0.97
	chatImageMaxTokens            = 50000
)

type OpenAIChatRendererConfig struct {
	HTTPClient *http.Client
	Storage    storage.AssetStorage
	LookupEnv  LookupFunc
}

type OpenAIChatRenderer struct {
	httpClient *http.Client
	storage    storage.AssetStorage
	lookupEnv  LookupFunc
}

func NewOpenAIChatRenderer(cfg OpenAIChatRendererConfig) *OpenAIChatRenderer {
	client := cfg.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	return &OpenAIChatRenderer{httpClient: client, storage: cfg.Storage, lookupEnv: cfg.LookupEnv}
}

func (r *OpenAIChatRenderer) Render(ctx context.Context, job JobContext) (*RenderedImage, error) {
	payload, err := r.buildPayload(job)
	if err != nil {
		return nil, err
	}
	response, err := r.sendRequest(ctx, job.Provider, payload)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	return r.parseResponse(ctx, response, job)
}

func (r *OpenAIChatRenderer) buildPayload(job JobContext) (map[string]any, error) {
	messages, err := buildChatMessages(job, r.storage)
	if err != nil {
		return nil, err
	}
	model := strings.TrimSpace(job.ProviderModel)
	if model == "" {
		model = strings.TrimSpace(job.Provider.DefaultModel)
	}
	return map[string]any{
		"model":             model,
		"messages":          messages,
		"temperature":       chatImageTemperature,
		"max_tokens":        chatImageMaxTokens,
		"stream":            true,
		"presence_penalty":  0,
		"frequency_penalty": 0,
	}, nil
}

func (r *OpenAIChatRenderer) sendRequest(ctx context.Context, provider ProviderConfig, payload map[string]any) (*http.Response, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, WrapError("provider_request_invalid", "provider request payload invalid", true, err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, buildProviderURL(provider.BaseURL), bytes.NewReader(body))
	if err != nil {
		return nil, WrapError("provider_request_invalid", "provider request invalid", true, err)
	}
	apiKey, err := r.readProviderAPIKey(provider)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := r.httpClient.Do(request)
	if err != nil {
		return nil, WrapError("provider_request_failed", "provider request failed", false, err)
	}
	return response, nil
}

func (r *OpenAIChatRenderer) parseResponse(ctx context.Context, response *http.Response, job JobContext) (*RenderedImage, error) {
	content, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, WrapError("provider_response_invalid", "provider response read failed", false, err)
	}
	if response.StatusCode >= http.StatusBadRequest {
		return nil, NewError("provider_request_failed", extractProviderError(content), false)
	}
	payload, err := parseChatResponsePayload(content, response.Header.Get("Content-Type"))
	if err != nil {
		return nil, err
	}
	ref, err := extractImageReference(payload)
	if err != nil {
		return nil, err
	}
	return r.resolveRenderedImage(ctx, ref, response, job)
}

func (r *OpenAIChatRenderer) resolveRenderedImage(
	ctx context.Context,
	ref imageReference,
	response *http.Response,
	job JobContext,
) (*RenderedImage, error) {
	content, mimeType, err := r.resolveImageReference(ctx, ref)
	if err != nil {
		return nil, err
	}
	revisedPrompt := job.Prompt
	requestID := response.Header.Get("X-Request-Id")
	if requestID == "" {
		requestID = fmt.Sprintf("%s:%d", job.Provider.Name, job.ID)
	}
	return &RenderedImage{
		Content: content, MimeType: mimeType,
		RevisedPrompt: &revisedPrompt, ProviderRequestID: &requestID,
	}, nil
}

func (r *OpenAIChatRenderer) resolveImageReference(ctx context.Context, ref imageReference) ([]byte, string, error) {
	if ref.kind == "base64" {
		return decodeBase64Image(ref.value, ref.mimeType)
	}
	if ref.kind == "url" {
		return r.downloadImage(ctx, ref.value)
	}
	return nil, "", NewError("provider_response_invalid", "provider image reference invalid", false)
}

func (r *OpenAIChatRenderer) downloadImage(ctx context.Context, url string) ([]byte, string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, "", WrapError("provider_image_download_failed", "provider image download request invalid", false, err)
	}
	response, err := r.httpClient.Do(request)
	if err != nil {
		return nil, "", WrapError("provider_image_download_failed", "provider image download failed", false, err)
	}
	defer response.Body.Close()
	return readImageDownload(response)
}

func (r *OpenAIChatRenderer) readProviderAPIKey(provider ProviderConfig) (string, error) {
	if strings.TrimSpace(provider.APIKeyEnv) == "" {
		return "", NewError("provider_api_key_missing", "provider api key env missing", true)
	}
	if r.lookupEnv == nil {
		return "", NewError("provider_api_key_missing", "provider api key lookup missing", true)
	}
	value, ok := r.lookupEnv(provider.APIKeyEnv)
	if !ok || value == "" {
		return "", NewError("provider_api_key_missing", "provider api key env "+provider.APIKeyEnv+" is not set", true)
	}
	return value, nil
}

func buildProviderURL(baseURL string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if trimmed == "" {
		return openAIChatCompletionsEndpoint
	}
	return trimmed + openAIChatCompletionsEndpoint
}
