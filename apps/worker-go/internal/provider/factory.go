package provider

import (
	"net/http"
	"os"

	"github.com/yantianqi1/image-studio/apps/worker-go/internal/storage"
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
	if job.ClientProviderConfigRaw != "" {
		return nil, NewError("client_provider_config_unsupported", "go worker render mode does not support client provider config yet", true)
	}
	if job.Provider.Status != "active" {
		return nil, NewError("provider_not_active", "provider not active", true)
	}
	if job.Provider.Type == OpenAIChatCompatibleType {
		return NewOpenAIChatRenderer(OpenAIChatRendererConfig{
			HTTPClient: f.httpClient,
			Storage:    f.storage,
			LookupEnv:  f.lookupEnv,
		}), nil
	}
	return nil, NewError("provider_type_unsupported", "go worker render mode does not support provider type "+job.Provider.Type, true)
}
