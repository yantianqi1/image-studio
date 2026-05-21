package service

import (
	"fmt"
	"strings"
)

const (
	localDevProviderType       = "local-dev"
	openAIProviderType         = "openai-compatible"
	openAIChatProviderType     = "openai-chat-compatible"
	openRouterChatProviderType = "openrouter-chat-image"
)

func validateClientProviderConfig(config *ClientProviderConfig) error {
	if config == nil {
		return nil
	}
	if strings.TrimSpace(config.ClientID) == "" || strings.TrimSpace(config.APIKey) == "" {
		return fmt.Errorf("%w: client id and api key are required together", ErrInvalidInput)
	}
	if len(config.ClientID) > 128 {
		return fmt.Errorf("%w: client id is too long", ErrInvalidInput)
	}
	if config.BaseURL != "" && !validBaseURL(config.BaseURL) {
		return fmt.Errorf("%w: client provider base url must be http or https", ErrInvalidInput)
	}
	return nil
}

func validBaseURL(value string) bool {
	return strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://")
}

func serializeClientProviderConfig(config *ClientProviderConfig, providerType string) (map[string]string, error) {
	if config == nil {
		return nil, nil
	}
	if !supportedProviderType(providerType) {
		return nil, fmt.Errorf("%w: provider type invalid", ErrInvalidInput)
	}
	payload := map[string]string{
		"client_id":     config.ClientID,
		"api_key":       config.APIKey,
		"provider_type": providerType,
	}
	if strings.TrimSpace(config.BaseURL) != "" {
		payload["base_url"] = strings.TrimSpace(config.BaseURL)
	}
	return payload, nil
}

func supportedProviderType(providerType string) bool {
	switch providerType {
	case localDevProviderType, openAIProviderType, openAIChatProviderType, openRouterChatProviderType:
		return true
	default:
		return false
	}
}
