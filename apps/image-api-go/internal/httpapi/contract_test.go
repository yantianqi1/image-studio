package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/yantianqi1/image-studio/apps/image-api-go/internal/service"
)

var contractJobFields = []string{
	"id", "user_id", "source", "mode", "title", "prompt", "model_code", "visibility",
	"source_asset_id", "provider_id", "provider_model", "client_provider_base_url", "status",
	"requested_count", "attempt_count", "max_attempts", "size", "quality", "provider_input_tokens",
	"provider_output_tokens", "provider_total_tokens", "raw_provider_cost_cents",
	"provider_fee_cents", "internal_cost_cents", "error_code", "error_message", "created_at",
	"available_at", "started_at", "finished_at",
}

var contractResultFields = []string{
	"id", "job_id", "result_index", "asset_id", "asset_url", "thumbnail_url", "visibility",
	"published_at", "created_at", "revised_prompt", "provider_request_id",
}

var contractGalleryItemFields = []string{
	"asset_id", "asset_url", "thumbnail_url", "visibility", "published_at", "created_at",
	"job_id", "result_index", "prompt", "revised_prompt",
}

var contractItemFields = []string{
	"id", "job_id", "result_index", "status", "asset_id", "error_code", "error_message",
	"manual_retry_count", "created_at", "available_at", "started_at", "finished_at", "cancelled_at",
}

var contractDeleteJobFields = []string{"deleted", "id"}

func TestContractPublicJobSuccessEnvelope(t *testing.T) {
	handler := NewHandler(&fakeReader{job: &service.JobPayload{ID: 12, Status: "queued"}}, Config{})
	request := httptest.NewRequest(http.MethodGet, "/api/public/image/jobs/12", nil)
	request.AddCookie(&http.Cookie{Name: "studio_user_session", Value: "user-token"})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	payload := decodeObject(t, response.Body.Bytes())
	assertObjectKeys(t, payload, []string{"data", "meta", "error"})
}

func TestContractPublicJobPayloadFields(t *testing.T) {
	handler := NewHandler(&fakeReader{job: fullContractJob()}, Config{})
	request := httptest.NewRequest(http.MethodGet, "/api/public/image/jobs/12", nil)
	request.AddCookie(&http.Cookie{Name: "studio_user_session", Value: "user-token"})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	payload := decodeObject(t, response.Body.Bytes())
	data, ok := payload["data"].(map[string]any)
	if !ok {
		t.Fatalf("data is not object: %#v", payload["data"])
	}
	assertObjectKeys(t, data, contractJobFields)
}

func TestContractPublicJobResultsPayloadFields(t *testing.T) {
	handler := NewHandler(&fakeReader{job: fullContractJob()}, Config{})
	request := httptest.NewRequest(http.MethodGet, "/api/public/image/jobs/12/results", nil)
	request.AddCookie(&http.Cookie{Name: "studio_user_session", Value: "user-token"})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	payload := decodeObject(t, response.Body.Bytes())
	items, ok := payload["data"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("data is not a single result list: %#v", payload["data"])
	}
	data, ok := items[0].(map[string]any)
	if !ok {
		t.Fatalf("result item is not object: %#v", items[0])
	}
	assertObjectKeys(t, data, contractResultFields)
}

func TestContractPublicJobItemsPayloadFields(t *testing.T) {
	handler := NewHandler(&fakeReader{items: []service.ItemPayload{fullContractItem()}}, Config{})
	request := httptest.NewRequest(http.MethodGet, "/api/public/image/jobs/12/items", nil)
	request.AddCookie(&http.Cookie{Name: "studio_user_session", Value: "user-token"})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	payload := decodeObject(t, response.Body.Bytes())
	items, ok := payload["data"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("data is not a single item list: %#v", payload["data"])
	}
	data, ok := items[0].(map[string]any)
	if !ok {
		t.Fatalf("job item is not object: %#v", items[0])
	}
	assertObjectKeys(t, data, contractItemFields)
}

func TestContractPublicGalleryPayloadFields(t *testing.T) {
	handler := NewHandler(&fakeReader{gallery: []service.GalleryItemPayload{fullContractGalleryItem()}}, Config{})
	request := httptest.NewRequest(http.MethodGet, "/api/public/image/gallery?scope=public", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	payload := decodeObject(t, response.Body.Bytes())
	items, ok := payload["data"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("data is not a single gallery list: %#v", payload["data"])
	}
	data, ok := items[0].(map[string]any)
	if !ok {
		t.Fatalf("gallery item is not object: %#v", items[0])
	}
	assertObjectKeys(t, data, contractGalleryItemFields)
}

func TestContractPublicDeleteJobPayloadFields(t *testing.T) {
	handler := NewHandler(&fakeReader{deleted: &service.DeleteJobPayload{Deleted: true, ID: "12"}}, Config{})
	request := httptest.NewRequest(http.MethodDelete, "/api/public/image/jobs/12", nil)
	request.AddCookie(&http.Cookie{Name: "studio_user_session", Value: "user-token"})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	payload := decodeObject(t, response.Body.Bytes())
	data, ok := payload["data"].(map[string]any)
	if !ok {
		t.Fatalf("delete data is not object: %#v", payload["data"])
	}
	assertObjectKeys(t, data, contractDeleteJobFields)
}

func fullContractJob() *service.JobPayload {
	return &service.JobPayload{
		ID: 12, Source: "member", Mode: "generate", Prompt: "Draw a city",
		ModelCode: "gpt-image-2", Visibility: "private", Status: "queued",
		RequestedCount: 1, CreatedAt: "2026-05-21T12:00:00", AvailableAt: "2026-05-21T12:00:00",
	}
}

func fullContractGalleryItem() service.GalleryItemPayload {
	return service.GalleryItemPayload{
		AssetID: 3, AssetURL: "/api/public/image/assets/3",
		ThumbnailURL: "/api/public/image/assets/3/thumbnail",
		Visibility:   "public", CreatedAt: "2026-05-21T12:00:00",
		JobID: 12, ResultIndex: 1, Prompt: "Draw a city",
	}
}

func fullContractItem() service.ItemPayload {
	return service.ItemPayload{
		ID: 33, JobID: 12, ResultIndex: 1, Status: "queued", ManualRetryCount: 0,
		CreatedAt: "2026-05-21T12:00:00", AvailableAt: "2026-05-21T12:00:00",
	}
}

func decodeObject(t *testing.T, body []byte) map[string]any {
	t.Helper()
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("decode response: %v body=%s", err, body)
	}
	return payload
}

func assertObjectKeys(t *testing.T, payload map[string]any, keys []string) {
	t.Helper()
	if len(payload) != len(keys) {
		t.Fatalf("keys = %#v, want exactly %#v", mapKeys(payload), keys)
	}
	for _, key := range keys {
		if _, ok := payload[key]; !ok {
			t.Fatalf("missing key %q in %#v", key, payload)
		}
	}
}

func mapKeys(payload map[string]any) []string {
	keys := make([]string, 0, len(payload))
	for key := range payload {
		keys = append(keys, key)
	}
	return keys
}
