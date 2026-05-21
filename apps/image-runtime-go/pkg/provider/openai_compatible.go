package provider

import (
	"context"
	"fmt"
	"net/http"
	"path"
	"strings"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
)

const (
	openAIImageGenerationEndpoint = "/images/generations"
	openAIImageEditEndpoint       = "/images/edits"
)

type OpenAICompatibleRendererConfig struct {
	HTTPClient *http.Client
	Storage    storage.AssetStorage
	LookupEnv  LookupFunc
}

type OpenAICompatibleRenderer struct {
	http    rendererHTTPClient
	storage storage.AssetStorage
}

func NewOpenAICompatibleRenderer(cfg OpenAICompatibleRendererConfig) *OpenAICompatibleRenderer {
	return &OpenAICompatibleRenderer{http: newRendererHTTPClient(cfg.HTTPClient, cfg.LookupEnv), storage: cfg.Storage}
}

func (r *OpenAICompatibleRenderer) Render(ctx context.Context, job JobContext) (*RenderedImage, error) {
	assets := openAICompatibleEditAssets(job)
	if len(assets) > 0 {
		return r.renderEdit(ctx, job, assets)
	}
	return r.renderGeneration(ctx, job)
}

func (r *OpenAICompatibleRenderer) renderGeneration(ctx context.Context, job JobContext) (*RenderedImage, error) {
	response, err := r.http.postJSON(ctx, job.Provider, openAIImageGenerationEndpoint, buildOpenAIImagePayload(job))
	if err != nil {
		return nil, err
	}
	return r.parseResponse(ctx, response, job)
}

func (r *OpenAICompatibleRenderer) renderEdit(
	ctx context.Context,
	job JobContext,
	assets []AssetRef,
) (*RenderedImage, error) {
	files, err := r.multipartFiles(assets)
	if err != nil {
		return nil, err
	}
	fields := openAIImageFormFields(job)
	response, err := r.http.postMultipart(ctx, job.Provider, openAIImageEditEndpoint, fields, files)
	if err != nil {
		return nil, err
	}
	return r.parseResponse(ctx, response, job)
}

func (r *OpenAICompatibleRenderer) parseResponse(
	ctx context.Context,
	response providerResponse,
	job JobContext,
) (*RenderedImage, error) {
	payload, err := parseJSONMap(response.Content)
	if err != nil {
		return nil, err
	}
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

func (r *OpenAICompatibleRenderer) multipartFiles(assets []AssetRef) ([]formFile, error) {
	if r.storage == nil {
		return nil, NewError("asset_storage_missing", "asset storage missing", true)
	}
	files := make([]formFile, 0, len(assets))
	for _, asset := range assets {
		content, err := r.storage.ReadBytes(asset.StoragePath)
		if err != nil {
			return nil, WrapError("source_asset_file_missing", "source asset file missing", false, err)
		}
		files = append(files, formFile{
			fieldName: "image", fileName: path.Base(asset.StoragePath), mimeType: asset.MimeType, content: content,
		})
	}
	return files, nil
}

func buildOpenAIImagePayload(job JobContext) map[string]any {
	payload := map[string]any{"model": providerModel(job), "prompt": job.Prompt}
	addOptionalString(payload, "size", job.Size)
	addOptionalString(payload, "quality", job.Quality)
	return payload
}

func openAIImageFormFields(job JobContext) []formField {
	payload := buildOpenAIImagePayload(job)
	fields := make([]formField, 0, len(payload))
	for _, key := range []string{"model", "prompt", "size", "quality"} {
		if value, ok := payload[key].(string); ok {
			fields = append(fields, formField{name: key, value: value})
		}
	}
	return fields
}

func openAICompatibleEditAssets(job JobContext) []AssetRef {
	if len(job.ReferenceAssets) > 0 {
		return append([]AssetRef(nil), job.ReferenceAssets...)
	}
	if job.SourceAsset != nil {
		return []AssetRef{*job.SourceAsset}
	}
	return nil
}

func providerModel(job JobContext) string {
	model := strings.TrimSpace(job.ProviderModel)
	if model != "" {
		return model
	}
	return strings.TrimSpace(job.Provider.DefaultModel)
}

func addOptionalString(payload map[string]any, key string, value string) {
	trimmed := strings.TrimSpace(value)
	if trimmed != "" {
		payload[key] = trimmed
	}
}

func providerRequestID(headerValue string, job JobContext) string {
	if headerValue != "" {
		return headerValue
	}
	return fmt.Sprintf("%s:%d", job.Provider.Name, job.ID)
}
