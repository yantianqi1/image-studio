package provider

import (
	"context"
	"net/http"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
)

const (
	chatCompletionsEndpoint = "/chat/completions"
	chatImageTemperature    = 0.97
	chatImageMaxTokens      = 50000
)

type OpenAIChatRendererConfig struct {
	HTTPClient *http.Client
	Storage    storage.AssetStorage
	LookupEnv  LookupFunc
}

type OpenAIChatRenderer struct {
	http    rendererHTTPClient
	storage storage.AssetStorage
}

func NewOpenAIChatRenderer(cfg OpenAIChatRendererConfig) *OpenAIChatRenderer {
	return &OpenAIChatRenderer{http: newRendererHTTPClient(cfg.HTTPClient, cfg.LookupEnv), storage: cfg.Storage}
}

func (r *OpenAIChatRenderer) Render(ctx context.Context, job JobContext) (*RenderedImage, error) {
	payload, err := r.buildPayload(job)
	if err != nil {
		return nil, err
	}
	response, err := r.http.postJSON(ctx, job.Provider, chatCompletionsEndpoint, payload)
	if err != nil {
		return nil, err
	}
	return r.parseResponse(ctx, response, job)
}

func (r *OpenAIChatRenderer) buildPayload(job JobContext) (map[string]any, error) {
	messages, err := buildChatMessages(job, r.storage)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"model":             providerModel(job),
		"messages":          messages,
		"temperature":       chatImageTemperature,
		"max_tokens":        chatImageMaxTokens,
		"stream":            true,
		"presence_penalty":  0,
		"frequency_penalty": 0,
	}, nil
}

func (r *OpenAIChatRenderer) parseResponse(ctx context.Context, response providerResponse, job JobContext) (*RenderedImage, error) {
	payload, err := parseChatResponsePayload(response.Content, response.Header.Get("Content-Type"))
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
	response providerResponse,
	job JobContext,
) (*RenderedImage, error) {
	content, mimeType, err := r.http.resolveImageReference(ctx, ref)
	if err != nil {
		return nil, err
	}
	revisedPrompt := job.Prompt
	requestID := providerRequestID(response.Header.Get("X-Request-Id"), job)
	return &RenderedImage{
		Content: content, MimeType: mimeType,
		RevisedPrompt: &revisedPrompt, ProviderRequestID: &requestID,
	}, nil
}
