package observability

import (
	"context"
	"net/http"
	"net/http/pprof"
)

type ReadyFunc func(context.Context) error

type DiagnosticsOptions struct {
	EnablePprof bool
}

func NewDiagnosticsHandler(metrics *Metrics, ready ReadyFunc) http.Handler {
	return NewDiagnosticsHandlerWithOptions(metrics, ready, DiagnosticsOptions{})
}

func NewDiagnosticsHandlerWithOptions(metrics *Metrics, ready ReadyFunc, opts DiagnosticsOptions) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok\n"))
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if ready == nil || ready(r.Context()) != nil {
			http.Error(w, "not ready", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ready\n"))
	})
	mux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		_ = r
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		_, _ = w.Write([]byte(metrics.PrometheusText()))
	})
	if opts.EnablePprof {
		registerPprof(mux)
	}
	return mux
}

func registerPprof(mux *http.ServeMux) {
	mux.HandleFunc("/debug/pprof/", pprof.Index)
	mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
	mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	mux.HandleFunc("/debug/pprof/trace", pprof.Trace)
}
