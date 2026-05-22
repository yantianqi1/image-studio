package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakeReadyChecker struct {
	err error
}

func (f fakeReadyChecker) Check(context.Context) error {
	return f.err
}

func TestHealthzReturnsJSON(t *testing.T) {
	response := recordResponse(NewHandler(Config{Ready: fakeReadyChecker{}}), http.MethodGet, "/healthz")

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", response.Code)
	}
	payload := decodePayload(t, response)
	if payload.Error != nil {
		t.Fatalf("unexpected error: %#v", payload.Error)
	}
	if payload.Data["status"] != "ok" {
		t.Fatalf("unexpected data: %#v", payload.Data)
	}
}

func TestReadyzReturnsJSONErrorWhenDatabaseUnavailable(t *testing.T) {
	readyErr := errors.New("database ping failed")
	response := recordResponse(
		NewHandler(Config{Ready: fakeReadyChecker{err: readyErr}}),
		http.MethodGet,
		"/readyz",
	)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("unexpected status: %d", response.Code)
	}
	payload := decodePayload(t, response)
	if payload.Error == nil || payload.Error.Code != "service_unavailable" {
		t.Fatalf("unexpected error: %#v", payload.Error)
	}
	if payload.Data != nil {
		t.Fatalf("unexpected data: %#v", payload.Data)
	}
}

func TestLocalBillingRoutesStayUnavailable(t *testing.T) {
	response := recordResponse(
		NewHandler(Config{Ready: fakeReadyChecker{}}),
		http.MethodPost,
		"/api/internal/core/billing/reservations",
	)

	if response.Code != http.StatusNotFound {
		t.Fatalf("unexpected status: %d", response.Code)
	}
	payload := decodePayload(t, response)
	if payload.Error == nil || payload.Error.Code != "not_found" {
		t.Fatalf("unexpected error: %#v", payload.Error)
	}
}

type responsePayload struct {
	Data  map[string]any `json:"data"`
	Meta  map[string]any `json:"meta"`
	Error *responseError `json:"error"`
}

type responseError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func recordResponse(handler http.Handler, method string, path string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func decodePayload(t *testing.T, response *httptest.ResponseRecorder) responsePayload {
	t.Helper()
	var payload responsePayload
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return payload
}
