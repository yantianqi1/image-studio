package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/yantianqi1/image-studio/apps/image-api-go/internal/service"
)

func (h *Handler) writePublicEvents(w http.ResponseWriter, r *http.Request, jobID int64, owner service.Owner) {
	if !h.acquireSSEConnection() {
		http.Error(w, "too many event streams", http.StatusTooManyRequests)
		return
	}
	defer h.sse.active.Add(-1)
	streamer, ok := newSSEStreamer(w)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), h.config.SSEMaxLifetime)
	defer cancel()
	h.streamJobEvents(ctx, streamer, jobID, owner)
}

func (h *Handler) acquireSSEConnection() bool {
	next := h.sse.active.Add(1)
	if next > h.config.SSEMaxConnections {
		h.sse.active.Add(-1)
		return false
	}
	return true
}

func (h *Handler) streamJobEvents(ctx context.Context, streamer sseStreamer, jobID int64, owner service.Owner) {
	job, err := h.reader.GetPublicJob(ctx, jobID, owner)
	if err != nil {
		writeSSEError(streamer, err)
		return
	}
	_ = streamer.WriteEvent("job_snapshot", publicJobEventPayload(job))
	if isTerminalStatus(job.Status) {
		_ = streamer.WriteEvent(jobTerminalEventName(job.Status), publicJobEventPayload(job))
		return
	}
	h.pollJobEvents(ctx, streamer, jobID, owner, job.Status)
}

func (h *Handler) pollJobEvents(ctx context.Context, streamer sseStreamer, jobID int64, owner service.Owner, status string) {
	pollTicker := time.NewTicker(h.config.SSEPollInterval)
	heartbeatTicker := time.NewTicker(h.config.SSEKeepAliveInterval)
	defer pollTicker.Stop()
	defer heartbeatTicker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-heartbeatTicker.C:
			_ = streamer.WriteEvent("heartbeat", map[string]any{"job_id": jobID})
		case <-pollTicker.C:
			status = h.pollAndWriteJobEvent(ctx, streamer, jobID, owner, status)
			if isTerminalStatus(status) {
				return
			}
		}
	}
}

func (h *Handler) pollAndWriteJobEvent(
	ctx context.Context,
	streamer sseStreamer,
	jobID int64,
	owner service.Owner,
	lastStatus string,
) string {
	job, err := h.reader.GetPublicJob(ctx, jobID, owner)
	if err != nil {
		writeSSEError(streamer, err)
		return lastStatus
	}
	if job.Status == lastStatus {
		return lastStatus
	}
	_ = streamer.WriteEvent(jobStatusEventName(job.Status), publicJobEventPayload(job))
	return job.Status
}

type sseStreamer interface {
	WriteEvent(name string, payload any) error
}

type httpSSEStreamer struct {
	writer  http.ResponseWriter
	flusher http.Flusher
}

func newSSEStreamer(w http.ResponseWriter) (sseStreamer, bool) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return nil, false
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	return httpSSEStreamer{writer: w, flusher: flusher}, true
}

func (s httpSSEStreamer) WriteEvent(name string, payload any) error {
	content, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(s.writer, "event: %s\ndata: %s\n\n", name, content); err != nil {
		return err
	}
	s.flusher.Flush()
	return nil
}

func writeSSEError(streamer sseStreamer, err error) {
	_ = streamer.WriteEvent("job_failed", map[string]any{"error": err.Error()})
}

func publicJobEventPayload(job *service.JobPayload) map[string]any {
	return map[string]any{"id": job.ID, "status": job.Status}
}

func jobStatusEventName(status string) string {
	switch status {
	case "running":
		return "item_started"
	case "succeeded":
		return "job_succeeded"
	case "failed":
		return "job_failed"
	default:
		return "job_snapshot"
	}
}

func jobTerminalEventName(status string) string {
	if status == "failed" {
		return "job_failed"
	}
	return "job_succeeded"
}

func isTerminalStatus(status string) bool {
	return status == "succeeded" || status == "failed"
}
