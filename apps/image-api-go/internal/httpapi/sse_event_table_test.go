package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/yantianqi1/image-studio/apps/image-api-go/internal/service"
)

func TestPublicJobEventsReplayStoredEventsWithSSEIDs(t *testing.T) {
	reader := &fakeReader{
		job: &service.JobPayload{ID: 12, Status: "running"},
		events: []service.JobEventPayload{{
			ID:        43,
			JobID:     12,
			EventType: "image_job.succeeded",
			Payload:   map[string]any{"id": float64(12), "status": "succeeded"},
		}},
	}
	handler := NewHandler(reader, Config{SSEMaxLifetime: time.Millisecond})
	request := httptest.NewRequest(http.MethodGet, "/api/public/image/jobs/12/events?since_event_id=42", nil)
	request.Header.Set("X-Debug-Owner-User-ID", "7")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	if reader.eventsAfterID != 42 {
		t.Fatalf("events after id = %d, want 42", reader.eventsAfterID)
	}
	body := response.Body.String()
	for _, text := range []string{"id: 43", "event: job_succeeded", `"status":"succeeded"`} {
		if !strings.Contains(body, text) {
			t.Fatalf("event stream missing %q:\n%s", text, body)
		}
	}
}

func TestPublicJobEventsMapsItemSucceededToPublicSSEName(t *testing.T) {
	reader := &fakeReader{
		job: &service.JobPayload{ID: 12, Status: "running"},
		events: []service.JobEventPayload{{
			ID:        44,
			JobID:     12,
			EventType: "image_job_item.succeeded",
			Payload:   map[string]any{"id": float64(12), "status": "succeeded", "item_id": float64(6)},
		}},
	}
	handler := NewHandler(reader, Config{SSEMaxLifetime: time.Millisecond})
	request := httptest.NewRequest(http.MethodGet, "/api/public/image/jobs/12/events?since_event_id=43", nil)
	request.Header.Set("X-Debug-Owner-User-ID", "7")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	body := response.Body.String()
	for _, text := range []string{"id: 44", "event: item_succeeded", `"item_id":6`} {
		if !strings.Contains(body, text) {
			t.Fatalf("event stream missing %q:\n%s", text, body)
		}
	}
}

func TestPublicJobEventsMapsItemStateEventsToPublicSSENames(t *testing.T) {
	tests := map[string]string{
		"image_job_item.cancelled":       "item_cancelled",
		"image_job_item.dead_lettered":   "item_failed",
		"image_job_item.failed":          "item_failed",
		"image_job_item.retry_scheduled": "item_retry_scheduled",
	}
	for eventType, want := range tests {
		if got := sseEventName(eventType); got != want {
			t.Fatalf("sseEventName(%q) = %q, want %q", eventType, got, want)
		}
	}
}
