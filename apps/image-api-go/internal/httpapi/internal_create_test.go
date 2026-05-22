package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/yantianqi1/image-studio/apps/image-api-go/internal/service"
)

func TestInternalCreateRequiresFlag(t *testing.T) {
	reader := &fakeReader{created: &service.JobPayload{ID: 99, Status: "queued"}}
	handler := NewHandler(reader, Config{
		EnableInternalCreate: false,
		InternalServiceToken: "service-token",
	})
	request := newInternalCreateRequest("service-token")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", response.Code)
	}
	if reader.internalRequest != nil {
		t.Fatalf("CreateInternalJob was called with disabled flag")
	}
}

func TestInternalCreateRejectsWhenTokenNotConfigured(t *testing.T) {
	reader := &fakeReader{created: &service.JobPayload{ID: 99, Status: "queued"}}
	handler := NewHandler(reader, Config{EnableInternalCreate: true})
	request := newInternalCreateRequest("service-token")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", response.Code)
	}
	if reader.internalRequest != nil {
		t.Fatalf("CreateInternalJob was called without configured token")
	}
}

func TestInternalCreateRejectsMissingOrEmptyToken(t *testing.T) {
	for _, headerValue := range []string{"", "   "} {
		reader := &fakeReader{created: &service.JobPayload{ID: 99, Status: "queued"}}
		handler := NewHandler(reader, Config{
			EnableInternalCreate: true,
			InternalServiceToken: "service-token",
		})
		request := newInternalCreateRequest(headerValue)
		response := httptest.NewRecorder()

		handler.ServeHTTP(response, request)

		if response.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", response.Code)
		}
		if reader.internalRequest != nil {
			t.Fatalf("CreateInternalJob was called with header %q", headerValue)
		}
	}
}

func TestInternalCreateRejectsWrongTokenWithoutEchoingSecrets(t *testing.T) {
	reader := &fakeReader{created: &service.JobPayload{ID: 99, Status: "queued"}}
	handler := NewHandler(reader, Config{
		EnableInternalCreate: true,
		InternalServiceToken: "service-token",
	})
	request := newInternalCreateRequest("wrong-token")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", response.Code)
	}
	body := response.Body.String()
	if strings.Contains(body, "wrong-token") || strings.Contains(body, "service-token") {
		t.Fatalf("token leaked in response body: %q", body)
	}
	if reader.internalRequest != nil {
		t.Fatalf("CreateInternalJob was called with wrong token")
	}
}

func TestInternalCreateAcceptsConfiguredToken(t *testing.T) {
	reader := &fakeReader{created: &service.JobPayload{ID: 99, Status: "queued"}}
	handler := NewHandler(reader, Config{
		EnableInternalCreate: true,
		InternalServiceToken: "service-token",
	})
	request := newInternalCreateRequest("service-token")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	if reader.internalRequest == nil || reader.internalRequest.RequestedCount != 4 {
		t.Fatalf("CreateInternalJob request = %#v", reader.internalRequest)
	}
	assertInternalCreatePayload(t, response.Body.Bytes())
}

func TestInternalCreateAcceptsNextToken(t *testing.T) {
	reader := &fakeReader{created: &service.JobPayload{ID: 99, Status: "queued"}}
	handler := NewHandler(reader, Config{
		EnableInternalCreate:     true,
		InternalServiceToken:     "service-token",
		InternalServiceTokenNext: "next-token",
	})
	request := newInternalCreateRequest("next-token")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	if reader.internalRequest == nil {
		t.Fatalf("CreateInternalJob was not called")
	}
}

func newInternalCreateRequest(token string) *http.Request {
	request := httptest.NewRequest(
		http.MethodPost,
		"/internal/image/jobs",
		strings.NewReader(`{"prompt":"x","model_code":"gpt-image-2","requested_count":4}`),
	)
	request.Header.Set("X-Debug-Owner-User-ID", "7")
	if token != "" {
		request.Header.Set("X-Internal-Service-Token", token)
	}
	return request
}

func assertInternalCreatePayload(t *testing.T, body []byte) {
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
