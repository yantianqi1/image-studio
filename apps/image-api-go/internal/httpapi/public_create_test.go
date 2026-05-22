package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/yantianqi1/image-studio/apps/image-api-go/internal/service"
)

func TestPublicCreateRequiresFlag(t *testing.T) {
	handler := NewHandler(&fakeReader{}, Config{EnablePublicCreate: false})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/public/image/jobs",
		strings.NewReader(`{"prompt":"x","model_code":"gpt-image-2","requested_count":1}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", response.Code)
	}
}

func TestPublicCreateSetsNewAnonymousSessionCookie(t *testing.T) {
	token := "new-anonymous-token"
	reader := &fakeReader{
		publicCreated: &service.PublicCreateJobResult{
			Job:                   &service.JobPayload{ID: 99, Status: "queued"},
			AnonymousSessionToken: &token,
		},
	}
	handler := NewHandler(reader, Config{EnablePublicCreate: true})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/public/image/jobs",
		strings.NewReader(`{"prompt":"hello","model_code":"gpt-image-2","requested_count":2}`),
	)
	request.Header.Set("X-Forwarded-For", "203.0.113.10, 10.0.0.2")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	if setCookieValue(response.Result().Cookies(), "studio_anonymous_session") != token {
		t.Fatalf("anonymous session cookie not set: %#v", response.Result().Cookies())
	}
	if reader.publicRequest == nil || reader.publicRequest.RequestIP != "203.0.113.10" {
		t.Fatalf("unexpected public create request: %#v", reader.publicRequest)
	}
	assertCreatedJobPayload(t, response.Body.Bytes())
}

func TestPublicCreateForwardsClientProviderHeaders(t *testing.T) {
	reader := &fakeReader{
		publicCreated: &service.PublicCreateJobResult{Job: &service.JobPayload{ID: 100, Status: "queued"}},
	}
	handler := NewHandler(reader, Config{EnablePublicCreate: true})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/public/image/jobs",
		strings.NewReader(`{"prompt":"hello","model_code":"gpt-image-2","requested_count":1}`),
	)
	request.Header.Set("X-Client-Id", "browser-client")
	request.Header.Set("X-Client-Provider-Base-Url", "https://api.example.test/v1")
	request.Header.Set("X-Client-Provider-Api-Key", "client-key")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	config := reader.publicRequest.ClientProviderConfig
	if config == nil || config.ClientID != "browser-client" || config.BaseURL != "https://api.example.test/v1" {
		t.Fatalf("unexpected client provider config: %#v", config)
	}
	if config.APIKey != "client-key" {
		t.Fatalf("client provider api key was not forwarded")
	}
}

func TestPublicCreateDefaultsRequestedCount(t *testing.T) {
	reader := &fakeReader{
		publicCreated: &service.PublicCreateJobResult{Job: &service.JobPayload{ID: 101, Status: "queued"}},
	}
	handler := NewHandler(reader, Config{EnablePublicCreate: true})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/public/image/jobs",
		strings.NewReader(`{"prompt":"hello","model_code":"gpt-image-2"}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	if reader.publicRequest.RequestedCount != 1 {
		t.Fatalf("requested_count = %d, want 1", reader.publicRequest.RequestedCount)
	}
}

func TestPublicCreateReturnsQueuedContractPayload(t *testing.T) {
	reader := &fakeReader{
		publicCreated: &service.PublicCreateJobResult{Job: queuedPublicCreateJob(3)},
	}
	handler := NewHandler(reader, Config{EnablePublicCreate: true})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/public/image/jobs",
		strings.NewReader(`{"prompt":"hello","model_code":"gpt-image-2","requested_count":3}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	if reader.publicRequest == nil || reader.publicRequest.RequestedCount != 3 {
		t.Fatalf("requested_count = %#v, want 3", reader.publicRequest)
	}
	payload := decodeObject(t, response.Body.Bytes())
	data, ok := payload["data"].(map[string]any)
	if !ok {
		t.Fatalf("data is not object: %#v", payload["data"])
	}
	if data["status"] != "queued" {
		t.Fatalf("status = %q, want queued", data["status"])
	}
	assertObjectKeys(t, data, contractJobFields)
}

func TestPublicCreateInvalidModelUsesCompatibleErrorStatus(t *testing.T) {
	reader := &fakeReader{publicErr: fmt.Errorf("%w: invalid model", service.ErrInvalidInput)}
	handler := NewHandler(reader, Config{EnablePublicCreate: true})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/public/image/jobs",
		strings.NewReader(`{"prompt":"hello","model_code":"missing-model","requested_count":1}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "invalid model") {
		t.Fatalf("body does not expose invalid model: %q", response.Body.String())
	}
}

func TestPublicCreateQuotaExceededUsesForbiddenStatus(t *testing.T) {
	reader := &fakeReader{publicErr: fmt.Errorf("%w: public quota exhausted", service.ErrForbidden)}
	handler := NewHandler(reader, Config{EnablePublicCreate: true})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/public/image/jobs",
		strings.NewReader(`{"prompt":"hello","model_code":"gpt-image-2","requested_count":1}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	if strings.TrimSpace(response.Body.String()) != "forbidden" {
		t.Fatalf("body = %q, want forbidden", response.Body.String())
	}
}

func queuedPublicCreateJob(requestedCount int) *service.JobPayload {
	return &service.JobPayload{
		ID: 102, Source: "member", Mode: "generate", Prompt: "hello",
		ModelCode: "gpt-image-2", Visibility: "private", Status: "queued",
		RequestedCount: requestedCount, CreatedAt: "2026-05-21T12:00:00",
		AvailableAt: "2026-05-21T12:00:00",
	}
}

func setCookieValue(cookies []*http.Cookie, name string) string {
	for _, cookie := range cookies {
		if cookie.Name == name {
			return cookie.Value
		}
	}
	return ""
}

func assertCreatedJobPayload(t *testing.T, body []byte) {
	t.Helper()
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	data := payload["data"].(map[string]any)
	if data["id"] != float64(99) || data["status"] != "queued" {
		t.Fatalf("unexpected create payload: %#v", payload)
	}
}
