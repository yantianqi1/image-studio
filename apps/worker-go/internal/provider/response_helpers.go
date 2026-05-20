package provider

import (
	"encoding/json"
	"strings"
)

func firstChoiceMessage(payload map[string]any) map[string]any {
	choice := firstMap(payload["choices"])
	if choice == nil {
		return map[string]any{}
	}
	message, _ := choice["message"].(map[string]any)
	return message
}

func firstMap(value any) map[string]any {
	items, ok := value.([]any)
	if !ok || len(items) == 0 {
		return nil
	}
	first, _ := items[0].(map[string]any)
	return first
}

func parseDataURL(url string) (string, string, bool) {
	if !strings.HasPrefix(url, "data:image/") {
		return "", "", false
	}
	parts := strings.SplitN(url, ";base64,", 2)
	if len(parts) != 2 {
		return "", "", false
	}
	return parts[1], strings.TrimPrefix(parts[0], "data:"), true
}

func isHTTPURL(url string) bool {
	return strings.HasPrefix(url, "http://") || strings.HasPrefix(url, "https://")
}

func extractProviderError(content []byte) string {
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		return truncate(string(content), 500)
	}
	errorPayload, ok := payload["error"].(map[string]any)
	if !ok {
		return truncate(string(content), 500)
	}
	message, ok := errorPayload["message"].(string)
	if !ok {
		return truncate(string(content), 500)
	}
	return truncate(message, 500)
}

func truncate(value string, limit int) string {
	cleaned := strings.TrimSpace(value)
	if len(cleaned) <= limit {
		return cleaned
	}
	return cleaned[:limit]
}
