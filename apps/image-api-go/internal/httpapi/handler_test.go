package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/yantianqi1/image-studio/apps/image-api-go/internal/service"
)

func TestPublicJobWithoutOwnerReturnsNotFound(t *testing.T) {
	handler := NewHandler(&fakeReader{}, Config{})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/public/image/jobs/12", nil))

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", response.Code)
	}
}

func TestPublicJobUsesUserSessionCookie(t *testing.T) {
	handler := NewHandler(&fakeReader{job: &service.JobPayload{ID: 12, Status: "queued"}}, Config{})
	request := httptest.NewRequest(http.MethodGet, "/api/public/image/jobs/12", nil)
	request.AddCookie(&http.Cookie{Name: "studio_user_session", Value: "user-token"})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	data := payload["data"].(map[string]any)
	if data["id"] != float64(12) || data["status"] != "queued" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}

func TestPublicJobIgnoresDebugOwnerHeaderByDefault(t *testing.T) {
	handler := NewHandler(
		&fakeReader{job: &service.JobPayload{ID: 12, Status: "queued"}, requireOwner: true},
		Config{},
	)
	request := httptest.NewRequest(http.MethodGet, "/api/public/image/jobs/12", nil)
	request.Header.Set("X-Debug-Owner-User-ID", "7")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", response.Code)
	}
}

func TestPublicAssetWritesCompatibleCacheHeaders(t *testing.T) {
	handler := NewHandler(&fakeReader{
		asset: &service.AssetContent{Content: []byte("image"), MimeType: "image/png"},
	}, Config{})
	request := httptest.NewRequest(http.MethodGet, "/api/public/image/assets/3", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	if response.Body.String() != "image" {
		t.Fatalf("unexpected body %q", response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "public, max-age=86400, s-maxage=604800" {
		t.Fatalf("unexpected cache headers: %#v", response.Header())
	}
}

func TestPublicJobEventsSendInitialSnapshot(t *testing.T) {
	handler := NewHandler(
		&fakeReader{job: &service.JobPayload{ID: 12, Status: "running"}},
		Config{SSEMaxLifetime: time.Millisecond},
	)
	request := httptest.NewRequest(http.MethodGet, "/api/public/image/jobs/12/events", nil)
	request.Header.Set("X-Debug-Owner-User-ID", "7")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	if contentType := response.Header().Get("Content-Type"); contentType != "text/event-stream" {
		t.Fatalf("content type = %q, want text/event-stream", contentType)
	}
	body := response.Body.String()
	if !strings.Contains(body, "event: job_snapshot") || !strings.Contains(body, `"status":"running"`) {
		t.Fatalf("unexpected event stream body:\n%s", body)
	}
}

func TestPublicJobEventsRejectsConnectionLimit(t *testing.T) {
	handler := NewHandler(
		&fakeReader{job: &service.JobPayload{ID: 12, Status: "running"}},
		Config{SSEMaxConnections: -1},
	)
	request := httptest.NewRequest(http.MethodGet, "/api/public/image/jobs/12/events", nil)
	request.Header.Set("X-Debug-Owner-User-ID", "7")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", response.Code)
	}
}

func TestAdminDebugRequiresInternalToken(t *testing.T) {
	handler := NewHandler(&fakeReader{}, Config{InternalDebugToken: "debug-token"})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/admin/image/jobs/12/debug", nil))

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", response.Code)
	}
}

func TestInternalCreateRequiresFlag(t *testing.T) {
	handler := NewHandler(&fakeReader{}, Config{EnableInternalCreate: false})
	request := httptest.NewRequest(
		http.MethodPost,
		"/internal/image/jobs",
		strings.NewReader(`{"prompt":"x","model_code":"gpt-image-2","requested_count":1}`),
	)
	request.Header.Set("X-Debug-Owner-User-ID", "7")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", response.Code)
	}
}

func TestInternalCreateReturnsQueuedPayload(t *testing.T) {
	handler := NewHandler(&fakeReader{created: &service.JobPayload{ID: 99, Status: "queued"}}, Config{EnableInternalCreate: true})
	request := httptest.NewRequest(
		http.MethodPost,
		"/internal/image/jobs",
		strings.NewReader(`{"prompt":"x","model_code":"gpt-image-2","requested_count":4}`),
	)
	request.Header.Set("X-Debug-Owner-User-ID", "7")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	data := payload["data"].(map[string]any)
	if data["id"] != float64(99) || data["status"] != "queued" {
		t.Fatalf("unexpected create payload: %#v", payload)
	}
}

type fakeReader struct {
	job           *service.JobPayload
	created       *service.JobPayload
	publicCreated *service.PublicCreateJobResult
	publicRequest *service.PublicCreateJobRequest
	asset         *service.AssetContent
	owner         service.Owner
	requireOwner  bool
}

func (r fakeReader) ResolveOwner(_ context.Context, tokens service.OwnerTokens) (service.Owner, error) {
	if tokens.UserSessionToken == "user-token" {
		id := int64(7)
		return service.Owner{UserID: &id}, nil
	}
	if r.owner.UserID != nil || r.owner.AnonymousSessionID != nil {
		return r.owner, nil
	}
	return service.Owner{}, nil
}

func (r fakeReader) GetPublicJob(_ context.Context, _ int64, owner service.Owner) (*service.JobPayload, error) {
	if r.requireOwner && owner.UserID == nil && owner.AnonymousSessionID == nil {
		return nil, service.ErrNotFound
	}
	if r.job == nil {
		return nil, service.ErrNotFound
	}
	return r.job, nil
}

func (r fakeReader) GetPublicResults(context.Context, int64, service.Owner) ([]service.ResultPayload, error) {
	return []service.ResultPayload{{ResultIndex: 1, AssetID: 3, AssetURL: "/api/public/image/assets/3"}}, nil
}

func (r fakeReader) GetAdminDebug(context.Context, int64) (*service.DebugPayload, error) {
	return &service.DebugPayload{JobID: 12}, nil
}

func (r fakeReader) CreateInternalJob(context.Context, service.CreateJobRequest) (*service.JobPayload, error) {
	if r.created == nil {
		return nil, service.ErrNotFound
	}
	return r.created, nil
}

func (r *fakeReader) CreatePublicJob(
	_ context.Context,
	request service.PublicCreateJobRequest,
) (*service.PublicCreateJobResult, error) {
	r.publicRequest = &request
	if r.publicCreated == nil {
		return nil, service.ErrNotFound
	}
	return r.publicCreated, nil
}

func (r fakeReader) GetPublicAsset(context.Context, int64, service.Owner) (*service.AssetContent, error) {
	if r.asset == nil {
		return nil, service.ErrNotFound
	}
	return r.asset, nil
}

func (r fakeReader) GetPublicAssetThumbnail(context.Context, int64, service.Owner) (*service.AssetContent, error) {
	return r.GetPublicAsset(context.Background(), 0, service.Owner{})
}
