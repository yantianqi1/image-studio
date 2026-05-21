package provider

import (
	"context"
	"net/http"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
)

var openRouterModalities = []string{"image", "text"}

type OpenRouterChatImageRendererConfig struct {
	HTTPClient *http.Client
	Storage    storage.AssetStorage
	LookupEnv  LookupFunc
}

type OpenRouterChatImageRenderer struct {
	http    rendererHTTPClient
	storage storage.AssetStorage
}

func NewOpenRouterChatImageRenderer(cfg OpenRouterChatImageRendererConfig) *OpenRouterChatImageRenderer {
	return &OpenRouterChatImageRenderer{http: newRendererHTTPClient(cfg.HTTPClient, cfg.LookupEnv), storage: cfg.Storage}
}

func (r *OpenRouterChatImageRenderer) Render(ctx context.Context, job JobContext) (*RenderedImage, error) {
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

func (r *OpenRouterChatImageRenderer) buildPayload(job JobContext) (map[string]any, error) {
	messages, err := buildRawPromptChatMessages(job, r.storage)
	if err != nil {
		return nil, err
	}
	payload := map[string]any{
		"model":      providerModel(job),
		"messages":   messages,
		"modalities": append([]string(nil), openRouterModalities...),
	}
	imageConfig, err := buildOpenRouterImageConfig(job.Size, job.Quality)
	if err != nil {
		return nil, err
	}
	if len(imageConfig) > 0 {
		payload["image_config"] = imageConfig
	}
	return payload, nil
}

func (r *OpenRouterChatImageRenderer) parseResponse(
	ctx context.Context,
	response providerResponse,
	job JobContext,
) (*RenderedImage, error) {
	payload, err := parseJSONMap(response.Content)
	if err != nil {
		return nil, err
	}
	rendered, err := r.renderedImageFromPayload(ctx, payload, response, job)
	if err != nil {
		return nil, err
	}
	usage, err := parseOpenRouterUsage(payload)
	if err != nil {
		return nil, err
	}
	rendered.Usage = usage
	return rendered, nil
}

func (r *OpenRouterChatImageRenderer) renderedImageFromPayload(
	ctx context.Context,
	payload map[string]any,
	response providerResponse,
	job JobContext,
) (*RenderedImage, error) {
	ref, err := extractImageReference(payload)
	if err != nil {
		return nil, err
	}
	content, mimeType, err := r.http.resolveImageReference(ctx, ref)
	if err != nil {
		return nil, err
	}
	requestID := providerRequestID(response.Header.Get("X-Request-Id"), job)
	revisedPrompt := job.Prompt
	return &RenderedImage{Content: content, MimeType: mimeType, RevisedPrompt: &revisedPrompt, ProviderRequestID: &requestID}, nil
}
