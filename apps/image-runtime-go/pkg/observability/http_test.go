package observability

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDiagnosticsHealthzReturnsOK(t *testing.T) {
	handler := NewDiagnosticsHandler(NewMetrics(), func(context.Context) error { return nil })
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if response.Code != http.StatusOK {
		t.Fatalf("healthz status = %d, want 200", response.Code)
	}
}

func TestDiagnosticsReadyzReturnsUnavailableWhenPingFails(t *testing.T) {
	handler := NewDiagnosticsHandler(NewMetrics(), func(context.Context) error { return errors.New("db down") })
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/readyz", nil))

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("readyz status = %d, want 503", response.Code)
	}
}

func TestDiagnosticsMetricsIncludesRequiredSeries(t *testing.T) {
	metrics := NewMetrics()
	metrics.IncClaim(2)
	metrics.IncClaimEmpty()
	metrics.IncItemStarted()
	metrics.IncItemSucceeded()
	metrics.IncItemFailed()
	metrics.IncItemRetried()
	metrics.IncHeartbeatFailed()
	metrics.ObserveRenderDuration(1.2)
	metrics.ObserveQueueWait(0.4)
	handler := NewDiagnosticsHandler(metrics, func(context.Context) error { return nil })
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	if response.Code != http.StatusOK {
		t.Fatalf("metrics status = %d, want 200", response.Code)
	}
	body := response.Body.String()
	for _, name := range []string{
		"image_worker_claim_total",
		"image_worker_claim_empty_total",
		"image_worker_item_started_total",
		"image_worker_item_succeeded_total",
		"image_worker_item_failed_total",
		"image_worker_item_retried_total",
		"image_worker_render_duration_seconds_bucket",
		"image_worker_queue_wait_seconds_bucket",
		"image_worker_running_items",
		"image_worker_provider_inflight",
		"image_worker_heartbeat_failed_total",
	} {
		if !strings.Contains(body, name) {
			t.Fatalf("metrics output missing %s:\n%s", name, body)
		}
	}
}

func TestDiagnosticsPprofDisabledByDefault(t *testing.T) {
	handler := NewDiagnosticsHandlerWithOptions(NewMetrics(), func(context.Context) error { return nil }, DiagnosticsOptions{})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/debug/pprof/", nil))

	if response.Code != http.StatusNotFound {
		t.Fatalf("pprof status = %d, want 404", response.Code)
	}
}

func TestDiagnosticsPprofCanBeExplicitlyEnabled(t *testing.T) {
	handler := NewDiagnosticsHandlerWithOptions(
		NewMetrics(),
		func(context.Context) error { return nil },
		DiagnosticsOptions{EnablePprof: true},
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/debug/pprof/", nil))

	if response.Code != http.StatusOK {
		t.Fatalf("pprof status = %d, want 200", response.Code)
	}
}
