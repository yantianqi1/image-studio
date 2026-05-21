package provider

import (
	"net/http"
	"os"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
)

type LookupFunc func(string) (string, bool)

type FactoryConfig struct {
	HTTPClient *http.Client
	Storage    storage.AssetStorage
	LookupEnv  LookupFunc
}

type Factory struct {
	httpClient *http.Client
	storage    storage.AssetStorage
	lookupEnv  LookupFunc
}

func NewFactory(cfg FactoryConfig) *Factory {
	client := cfg.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	lookup := cfg.LookupEnv
	if lookup == nil {
		lookup = os.LookupEnv
	}
	return &Factory{httpClient: client, storage: cfg.Storage, lookupEnv: lookup}
}

func (f *Factory) RendererFor(job JobContext) (Renderer, error) {
	if job.Provider.Status != providerStatusActive {
		return nil, NewError("provider_not_active", "provider not active", true)
	}
	if job.ClientProviderConfigRaw != "" {
		return f.clientProviderRendererFor(job.ClientProviderConfigRaw)
	}
	return f.rendererForType(job.Provider.Type)
}

func (f *Factory) clientProviderRendererFor(raw string) (Renderer, error) {
	config, err := ParseClientProviderConfig(raw)
	if err != nil {
		return nil, err
	}
	renderer, err := f.rendererForType(config.ProviderType)
	if err != nil {
		return nil, err
	}
	return clientProviderRenderer{delegate: renderer, config: config}, nil
}

func (f *Factory) rendererForType(providerType string) (Renderer, error) {
	if providerType == OpenAICompatibleType {
		return NewOpenAICompatibleRenderer(OpenAICompatibleRendererConfig{
			HTTPClient: f.httpClient,
			Storage:    f.storage,
			LookupEnv:  f.lookupEnv,
		}), nil
	}
	if providerType == OpenAIChatCompatibleType {
		return NewOpenAIChatRenderer(OpenAIChatRendererConfig{
			HTTPClient: f.httpClient,
			Storage:    f.storage,
			LookupEnv:  f.lookupEnv,
		}), nil
	}
	if providerType == OpenRouterChatImageType {
		return NewOpenRouterChatImageRenderer(OpenRouterChatImageRendererConfig{
			HTTPClient: f.httpClient,
			Storage:    f.storage,
			LookupEnv:  f.lookupEnv,
		}), nil
	}
	return nil, NewError("provider_type_unsupported", "go worker render mode does not support provider type "+providerType, true)
}
