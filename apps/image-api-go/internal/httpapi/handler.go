package httpapi

import (
	"context"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"github.com/yantianqi1/image-studio/apps/image-api-go/internal/service"
)

const (
	defaultSSEMaxConnections    = 500
	defaultSSEPollInterval      = time.Second
	defaultSSEKeepAliveInterval = 15 * time.Second
	defaultSSEMaxLifetime       = 10 * time.Minute
	defaultUserSessionCookie    = "studio_user_session"
	defaultAnonymousCookie      = "studio_anonymous_session"
)

type Reader interface {
	ResolveOwner(context.Context, service.OwnerTokens) (service.Owner, error)
	GetPublicJob(context.Context, int64, service.Owner) (*service.JobPayload, error)
	GetPublicEvents(context.Context, int64, service.Owner, int64, int) ([]service.JobEventPayload, error)
	GetPublicResults(context.Context, int64, service.Owner) ([]service.ResultPayload, error)
	GetPublicAsset(context.Context, int64, service.Owner) (*service.AssetContent, error)
	GetPublicAssetThumbnail(context.Context, int64, service.Owner) (*service.AssetContent, error)
	GetPublicGallery(context.Context, service.Owner, string) ([]service.GalleryItemPayload, error)
	DeletePublicJob(context.Context, int64, service.Owner) (*service.DeleteJobPayload, error)
	GetAdminDebug(context.Context, int64) (*service.DebugPayload, error)
	CreateInternalJob(context.Context, service.CreateJobRequest) (*service.JobPayload, error)
	CreatePublicJob(context.Context, service.PublicCreateJobRequest) (*service.PublicCreateJobResult, error)
}

type Config struct {
	InternalDebugToken            string
	Ready                         func(context.Context) error
	EnableInternalCreate          bool
	EnablePublicCreate            bool
	EnableDebugOwnerHeaders       bool
	SSEMaxConnections             int64
	SSEPollInterval               time.Duration
	SSEKeepAliveInterval          time.Duration
	SSEMaxLifetime                time.Duration
	UserSessionCookieName         string
	AnonymousSessionCookieName    string
	AnonymousSessionCookieSecure  bool
	AnonymousSessionMaxAgeSeconds int
}

type Handler struct {
	reader Reader
	config Config
	sse    *sseState
}

type sseState struct {
	active atomic.Int64
}

func NewHandler(reader Reader, config Config) http.Handler {
	return &Handler{reader: reader, config: normalizeConfig(config), sse: &sseState{}}
}

func (h Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := strings.Trim(r.URL.Path, "/")
	switch {
	case r.Method == http.MethodGet && path == "healthz":
		writeData(w, map[string]string{"status": "ok"})
	case r.Method == http.MethodGet && path == "readyz":
		h.handleReady(w, r)
	case r.Method == http.MethodGet && path == "api/public/image/gallery":
		h.handlePublicGallery(w, r)
	case r.Method == http.MethodGet && strings.HasPrefix(path, "api/public/image/jobs/"):
		h.handlePublicJob(w, r, path)
	case r.Method == http.MethodPost && path == "api/public/image/jobs":
		h.handlePublicCreate(w, r)
	case r.Method == http.MethodDelete && strings.HasPrefix(path, "api/public/image/jobs/"):
		h.handlePublicDeleteJob(w, r, path)
	case r.Method == http.MethodGet && strings.HasPrefix(path, "api/public/image/assets/"):
		h.handlePublicAsset(w, r, path)
	case r.Method == http.MethodGet && strings.HasPrefix(path, "api/admin/image/jobs/"):
		h.handleAdminDebug(w, r, path)
	case r.Method == http.MethodPost && path == "internal/image/jobs":
		h.handleInternalCreate(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (h Handler) handleReady(w http.ResponseWriter, r *http.Request) {
	if h.config.Ready != nil && h.config.Ready(r.Context()) != nil {
		http.Error(w, "not ready", http.StatusServiceUnavailable)
		return
	}
	writeData(w, map[string]string{"status": "ready"})
}

func (h Handler) handleAdminDebug(w http.ResponseWriter, r *http.Request, path string) {
	if h.config.InternalDebugToken == "" || r.Header.Get("X-Internal-Debug-Token") != h.config.InternalDebugToken {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	jobID, ok := parseAdminDebugPath(path)
	if !ok {
		http.NotFound(w, r)
		return
	}
	debug, err := h.reader.GetAdminDebug(r.Context(), jobID)
	writeServiceResult(w, debug, err)
}

func normalizeConfig(config Config) Config {
	if config.SSEMaxConnections == 0 {
		config.SSEMaxConnections = defaultSSEMaxConnections
	}
	if config.SSEPollInterval <= 0 {
		config.SSEPollInterval = defaultSSEPollInterval
	}
	if config.SSEKeepAliveInterval <= 0 {
		config.SSEKeepAliveInterval = defaultSSEKeepAliveInterval
	}
	if config.SSEMaxLifetime <= 0 {
		config.SSEMaxLifetime = defaultSSEMaxLifetime
	}
	if config.UserSessionCookieName == "" {
		config.UserSessionCookieName = defaultUserSessionCookie
	}
	if config.AnonymousSessionCookieName == "" {
		config.AnonymousSessionCookieName = defaultAnonymousCookie
	}
	if config.AnonymousSessionMaxAgeSeconds == 0 {
		config.AnonymousSessionMaxAgeSeconds = 365 * 24 * 60 * 60
	}
	return config
}
