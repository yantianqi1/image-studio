package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"os"
	"strings"
)

const jsonContentType = "application/json"

type rendererHTTPClient struct {
	httpClient *http.Client
	lookupEnv  LookupFunc
}

type providerResponse struct {
	Content    []byte
	Header     http.Header
	StatusCode int
}

type formField struct {
	name  string
	value string
}

type formFile struct {
	fieldName string
	fileName  string
	mimeType  string
	content   []byte
}

func newRendererHTTPClient(client *http.Client, lookup LookupFunc) rendererHTTPClient {
	if client == nil {
		client = http.DefaultClient
	}
	if lookup == nil {
		lookup = os.LookupEnv
	}
	return rendererHTTPClient{httpClient: client, lookupEnv: lookup}
}

func (c rendererHTTPClient) postJSON(
	ctx context.Context,
	provider ProviderConfig,
	endpoint string,
	payload map[string]any,
) (providerResponse, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return providerResponse{}, WrapError("provider_request_invalid", "provider request payload invalid", true, err)
	}
	return c.send(ctx, provider, endpoint, bytes.NewReader(body), jsonContentType)
}

func (c rendererHTTPClient) postMultipart(
	ctx context.Context,
	provider ProviderConfig,
	endpoint string,
	fields []formField,
	files []formFile,
) (providerResponse, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	if err := writeMultipartFields(writer, fields); err != nil {
		return providerResponse{}, err
	}
	if err := writeMultipartFiles(writer, files); err != nil {
		return providerResponse{}, err
	}
	if err := writer.Close(); err != nil {
		return providerResponse{}, WrapError("provider_request_invalid", "provider multipart close failed", true, err)
	}
	return c.send(ctx, provider, endpoint, body, writer.FormDataContentType())
}

func (c rendererHTTPClient) send(
	ctx context.Context,
	provider ProviderConfig,
	endpoint string,
	body io.Reader,
	contentType string,
) (providerResponse, error) {
	apiKey, err := c.readProviderAPIKey(provider)
	if err != nil {
		return providerResponse{}, err
	}
	url, err := buildProviderURL(provider.BaseURL, endpoint)
	if err != nil {
		return providerResponse{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, url, body)
	if err != nil {
		return providerResponse{}, WrapError("provider_request_invalid", "provider request invalid", true, err)
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Content-Type", contentType)
	return c.do(request, apiKey)
}

func (c rendererHTTPClient) do(request *http.Request, apiKey string) (providerResponse, error) {
	response, err := c.httpClient.Do(request)
	if err != nil {
		return providerResponse{}, WrapError("provider_request_failed", "provider request failed", false, err)
	}
	defer response.Body.Close()
	content, err := io.ReadAll(response.Body)
	if err != nil {
		return providerResponse{}, WrapError("provider_response_invalid", "provider response read failed", false, err)
	}
	if response.StatusCode >= http.StatusBadRequest {
		message := extractProviderError(content, apiKey)
		return providerResponse{}, NewError("provider_request_failed", message, false)
	}
	return providerResponse{Content: content, Header: response.Header, StatusCode: response.StatusCode}, nil
}

func (c rendererHTTPClient) readProviderAPIKey(provider ProviderConfig) (string, error) {
	if strings.TrimSpace(provider.APIKey) != "" {
		return strings.TrimSpace(provider.APIKey), nil
	}
	if strings.TrimSpace(provider.APIKeyEnv) == "" {
		return "", NewError("provider_api_key_missing", "provider api key env missing", true)
	}
	value, ok := c.lookupEnv(provider.APIKeyEnv)
	if !ok || value == "" {
		return "", NewError("provider_api_key_missing", "provider api key env "+provider.APIKeyEnv+" is not set", true)
	}
	return value, nil
}

func (c rendererHTTPClient) resolveImageReference(ctx context.Context, ref imageReference) ([]byte, string, error) {
	if ref.kind == "base64" {
		return decodeBase64Image(ref.value, ref.mimeType)
	}
	if ref.kind == "url" {
		return c.downloadImage(ctx, ref.value)
	}
	return nil, "", NewError("provider_response_invalid", "provider image reference invalid", false)
}

func (c rendererHTTPClient) downloadImage(ctx context.Context, url string) ([]byte, string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, "", WrapError("provider_image_download_failed", "provider image download request invalid", false, err)
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, "", WrapError("provider_image_download_failed", "provider image download failed", false, err)
	}
	defer response.Body.Close()
	return readImageDownload(response)
}

func buildProviderURL(baseURL string, endpoint string) (string, error) {
	trimmed := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if trimmed == "" {
		return "", NewError("provider_base_url_missing", "provider base url missing", true)
	}
	return trimmed + endpoint, nil
}

func writeMultipartFields(writer *multipart.Writer, fields []formField) error {
	for _, field := range fields {
		if err := writer.WriteField(field.name, field.value); err != nil {
			return WrapError("provider_request_invalid", "provider multipart field invalid", true, err)
		}
	}
	return nil
}

func writeMultipartFiles(writer *multipart.Writer, files []formFile) error {
	for _, file := range files {
		if err := writeMultipartFile(writer, file); err != nil {
			return err
		}
	}
	return nil
}

func writeMultipartFile(writer *multipart.Writer, file formFile) error {
	header := textproto.MIMEHeader{}
	header.Set("Content-Disposition", multipartFileDisposition(file.fieldName, file.fileName))
	header.Set("Content-Type", file.mimeType)
	part, err := writer.CreatePart(header)
	if err != nil {
		return WrapError("provider_request_invalid", "provider multipart file invalid", true, err)
	}
	if _, err := part.Write(file.content); err != nil {
		return WrapError("provider_request_invalid", "provider multipart file write failed", true, err)
	}
	return nil
}

func multipartFileDisposition(fieldName string, fileName string) string {
	escapedName := strings.ReplaceAll(fieldName, `"`, `\"`)
	escapedFile := strings.ReplaceAll(fileName, `"`, `\"`)
	return `form-data; name="` + escapedName + `"; filename="` + escapedFile + `"`
}
