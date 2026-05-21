package provider

import (
	"context"
	"encoding/json"
	"strings"
)

const (
	clientProviderSource      = "client_provider"
	maxClientProviderIDLength = 128
)

type ClientProviderConfig struct {
	ClientID      string `json:"client_id"`
	BaseURL       string `json:"base_url"`
	APIKey        string `json:"api_key"`
	ProviderType  string `json:"provider_type"`
	Model         string `json:"model"`
	ProviderModel string `json:"provider_model"`
}

type clientProviderRenderer struct {
	delegate Renderer
	config   ClientProviderConfig
}

func ParseClientProviderConfig(raw string) (ClientProviderConfig, error) {
	var config ClientProviderConfig
	if err := json.Unmarshal([]byte(raw), &config); err != nil {
		return config, WrapError("client_provider_config_invalid", "client provider config invalid", true, err)
	}
	config = normalizeClientProviderConfig(config)
	if err := validateClientProviderConfig(config); err != nil {
		return config, err
	}
	return config, nil
}

func (r clientProviderRenderer) Render(ctx context.Context, job JobContext) (*RenderedImage, error) {
	runtimeJob := job
	runtimeJob.Provider = r.config.ProviderConfig()
	if model := r.config.ModelName(); model != "" {
		runtimeJob.ProviderModel = model
	}
	return r.delegate.Render(ctx, runtimeJob)
}

func (c ClientProviderConfig) ProviderConfig() ProviderConfig {
	return ProviderConfig{
		Name:         clientProviderSource,
		Type:         c.ProviderType,
		BaseURL:      c.BaseURL,
		APIKey:       c.APIKey,
		DefaultModel: c.ModelName(),
		Status:       providerStatusActive,
	}
}

func (c ClientProviderConfig) ModelName() string {
	if c.ProviderModel != "" {
		return c.ProviderModel
	}
	return c.Model
}

func normalizeClientProviderConfig(config ClientProviderConfig) ClientProviderConfig {
	config.ClientID = strings.TrimSpace(config.ClientID)
	config.BaseURL = strings.TrimRight(strings.TrimSpace(config.BaseURL), "/")
	config.APIKey = strings.TrimSpace(config.APIKey)
	config.ProviderType = strings.TrimSpace(config.ProviderType)
	config.Model = strings.TrimSpace(config.Model)
	config.ProviderModel = strings.TrimSpace(config.ProviderModel)
	return config
}

func validateClientProviderConfig(config ClientProviderConfig) error {
	if config.APIKey == "" {
		return NewError("provider_api_key_missing", "provider api key missing", true)
	}
	if config.ProviderType == "" {
		return NewError("client_provider_config_invalid", "client provider type is missing", true)
	}
	if len(config.ClientID) > maxClientProviderIDLength {
		return NewError("client_provider_config_invalid", "client id is too long", true)
	}
	if config.BaseURL != "" && !isHTTPURL(config.BaseURL) {
		return NewError("client_provider_config_invalid", "client provider base url must be http or https", true)
	}
	return nil
}
