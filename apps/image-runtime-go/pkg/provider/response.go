package provider

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"regexp"
	"strings"
)

const defaultBase64MimeType = "image/png"

var markdownImagePattern = regexp.MustCompile(`!\[[^\]]*\]\((https?://[^\s)]+)\)`)

type imageReference struct {
	kind     string
	value    string
	mimeType string
}

func parseChatResponsePayload(content []byte, contentType string) (map[string]any, error) {
	if strings.Contains(contentType, "text/event-stream") {
		return map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": parseStreamingContent(string(content))}}}}, nil
	}
	if payload, err := parseJSONMap(content); err == nil {
		return payload, nil
	}
	text := strings.TrimSpace(string(content))
	if text == "" {
		return nil, NewError("provider_response_invalid", "provider response empty", false)
	}
	return map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": text}}}}, nil
}

func parseStreamingContent(text string) string {
	chunks := []string{}
	for _, line := range strings.Split(text, "\n") {
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if !strings.HasPrefix(line, "data:") || data == "" || data == "[DONE]" {
			continue
		}
		if chunk := extractStreamingChunk(data); chunk != "" {
			chunks = append(chunks, chunk)
		}
	}
	return strings.Join(chunks, "")
}

func extractStreamingChunk(data string) string {
	var payload map[string]any
	if err := json.Unmarshal([]byte(data), &payload); err != nil {
		return ""
	}
	choice := firstMap(payload["choices"])
	if choice == nil {
		return ""
	}
	return extractContent(choice["delta"]) + extractContent(choice["message"])
}

func extractImageReference(payload map[string]any) (imageReference, error) {
	if ref, ok := extractDataReference(payload); ok {
		return ref, nil
	}
	if ref, ok := extractContentArrayReference(payload); ok {
		return ref, nil
	}
	if ref, ok := extractMessageImagesReference(payload); ok {
		return ref, nil
	}
	return extractTextImageReference(payload)
}

func extractDataReference(payload map[string]any) (imageReference, bool) {
	first := firstMap(payload["data"])
	if first == nil {
		return imageReference{}, false
	}
	if value, ok := first["b64_json"].(string); ok && value != "" {
		return imageReference{kind: "base64", value: value, mimeType: defaultBase64MimeType}, true
	}
	if value, ok := first["url"].(string); ok && isHTTPURL(value) {
		return imageReference{kind: "url", value: value}, true
	}
	return imageReference{}, false
}

func extractContentArrayReference(payload map[string]any) (imageReference, bool) {
	message := firstChoiceMessage(payload)
	content, ok := message["content"].([]any)
	if !ok {
		return imageReference{}, false
	}
	for _, item := range content {
		if ref, ok := extractContentItemImage(item); ok {
			return ref, true
		}
	}
	return imageReference{}, false
}

func extractMessageImagesReference(payload map[string]any) (imageReference, bool) {
	message := firstChoiceMessage(payload)
	images, ok := message["images"].([]any)
	if !ok {
		return imageReference{}, false
	}
	for _, item := range images {
		if ref, ok := extractContentItemImage(item); ok {
			return ref, true
		}
	}
	return imageReference{}, false
}

func extractContentItemImage(item any) (imageReference, bool) {
	part, ok := item.(map[string]any)
	if !ok {
		return imageReference{}, false
	}
	if ref, ok := extractImageURLReference(part); ok {
		return ref, true
	}
	if part["type"] == "image" {
		return extractImageObjectReference(part)
	}
	return imageReference{}, false
}

func extractImageURLReference(part map[string]any) (imageReference, bool) {
	imageURL, ok := part["image_url"].(map[string]any)
	if !ok {
		return imageReference{}, false
	}
	url, ok := imageURL["url"].(string)
	if !ok {
		return imageReference{}, false
	}
	return referenceFromURL(url)
}

func extractImageObjectReference(part map[string]any) (imageReference, bool) {
	for _, key := range []string{"b64_json", "data"} {
		if value, ok := part[key].(string); ok && value != "" {
			return imageReference{kind: "base64", value: value, mimeType: defaultBase64MimeType}, true
		}
	}
	if value, ok := part["url"].(string); ok {
		return referenceFromURL(value)
	}
	return imageReference{}, false
}

func referenceFromURL(url string) (imageReference, bool) {
	if value, mimeType, ok := parseDataURL(url); ok {
		return imageReference{kind: "base64", value: value, mimeType: mimeType}, true
	}
	if isHTTPURL(url) {
		return imageReference{kind: "url", value: url}, true
	}
	return imageReference{}, false
}

func extractTextImageReference(payload map[string]any) (imageReference, error) {
	text := extractResponseText(payload)
	if match := markdownImagePattern.FindStringSubmatch(text); len(match) == 2 {
		return imageReference{kind: "url", value: match[1]}, nil
	}
	if strings.TrimSpace(text) != "" {
		return imageReference{}, NewError("provider_content_refused", truncate(text, 500), true)
	}
	return imageReference{}, NewError("provider_response_invalid", "provider response missing image data", false)
}

func extractResponseText(payload map[string]any) string {
	if text, ok := payload["output_text"].(string); ok {
		return text
	}
	if text := extractChoicesText(payload["choices"]); text != "" {
		return text
	}
	return extractOutputText(payload["output"])
}

func extractChoicesText(value any) string {
	message := firstChoiceMessage(map[string]any{"choices": value})
	return extractContent(message["content"])
}

func extractOutputText(value any) string {
	first := firstMap(value)
	if first == nil {
		return ""
	}
	content := firstMap(first["content"])
	if content == nil {
		return ""
	}
	text, _ := content["text"].(string)
	return text
}

func extractContent(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case map[string]any:
		return extractContent(typed["content"])
	case []any:
		return extractContentList(typed)
	default:
		return ""
	}
}

func extractContentList(items []any) string {
	parts := []string{}
	for _, item := range items {
		part, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if part["type"] == "text" {
			parts = append(parts, extractContent(part["text"]))
		}
	}
	return strings.Join(parts, "\n")
}

func readImageDownload(response *http.Response) ([]byte, string, error) {
	content, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, "", WrapError("provider_image_download_failed", "provider image download read failed", false, err)
	}
	if response.StatusCode >= http.StatusBadRequest {
		return nil, "", NewError("provider_image_download_failed", extractProviderError(content), false)
	}
	mimeType := strings.Split(response.Header.Get("Content-Type"), ";")[0]
	if strings.HasPrefix(mimeType, "image/") {
		return content, mimeType, nil
	}
	return nil, "", NewError("provider_image_download_invalid", "provider image url did not return an image", false)
}

func parseJSONMap(content []byte) (map[string]any, error) {
	decoder := json.NewDecoder(strings.NewReader(string(content)))
	decoder.UseNumber()
	var payload map[string]any
	if err := decoder.Decode(&payload); err != nil {
		return nil, NewError("provider_response_invalid", "provider response json invalid", false)
	}
	if payload == nil {
		return nil, NewError("provider_response_invalid", "provider response invalid", false)
	}
	return payload, nil
}

func decodeBase64Image(value string, mimeType string) ([]byte, string, error) {
	content, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return nil, "", WrapError("provider_response_invalid", "provider base64 image invalid", false, err)
	}
	if mimeType == "" {
		mimeType = defaultBase64MimeType
	}
	return content, mimeType, nil
}
