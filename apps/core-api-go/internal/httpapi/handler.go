package httpapi

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/yantianqi1/image-studio/apps/core-api-go/internal/db"
	"github.com/yantianqi1/image-studio/apps/core-api-go/internal/service"
)

const readyTimeout = 5 * time.Second

type Config struct {
	Ready service.ReadyChecker
}

type Handler struct {
	ready service.ReadyChecker
}

func NewHandler(config Config) http.Handler {
	return Handler{ready: config.Ready}
}

func (h Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/healthz":
		h.handleHealthz(w, r)
	case "/readyz":
		h.handleReadyz(w, r)
	default:
		writeError(w, http.StatusNotFound, "not_found", "route not found")
	}
}

func (h Handler) handleHealthz(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	writeData(w, service.Status{Status: "ok"})
}

func (h Handler) handleReadyz(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	if h.ready == nil {
		writeError(w, http.StatusInternalServerError, "server_misconfigured", "ready checker is missing")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), readyTimeout)
	defer cancel()
	if err := h.ready.Check(ctx); err != nil {
		writeReadinessError(w, err)
		return
	}
	writeData(w, service.Status{Status: "ready"})
}

func writeReadinessError(w http.ResponseWriter, err error) {
	if errors.Is(err, db.ErrDatabaseURLMissing) {
		writeError(w, http.StatusServiceUnavailable, "database_url_missing", "DATABASE_URL is required")
		return
	}
	writeError(w, http.StatusServiceUnavailable, "service_unavailable", "database is not ready")
}

func requireMethod(w http.ResponseWriter, r *http.Request, method string) bool {
	if r.Method == method {
		return true
	}
	writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
	return false
}
