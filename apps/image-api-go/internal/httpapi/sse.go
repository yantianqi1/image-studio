package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/yantianqi1/image-studio/apps/image-api-go/internal/service"
)

const sseEventBatchLimit = 100

func (h *Handler) writePublicEvents(w http.ResponseWriter, r *http.Request, jobID int64, owner service.Owner) {
	afterID, err := eventCursorFromRequest(r)
	if err != nil {
		http.Error(w, "invalid event cursor", http.StatusBadRequest)
		return
	}
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
	h.streamJobEvents(ctx, streamer, jobID, owner, afterID)
}

func (h *Handler) acquireSSEConnection() bool {
	next := h.sse.active.Add(1)
	if next > h.config.SSEMaxConnections {
		h.sse.active.Add(-1)
		return false
	}
	return true
}

func (h *Handler) streamJobEvents(
	ctx context.Context,
	streamer sseStreamer,
	jobID int64,
	owner service.Owner,
	afterID int64,
) {
	job, err := h.reader.GetPublicJob(ctx, jobID, owner)
	if err != nil {
		writeSSEError(streamer, err)
		return
	}
	if afterID == 0 {
		_ = streamer.WriteEvent("job_snapshot", publicJobEventPayload(job), nil)
	}
	h.pollJobEvents(ctx, streamer, jobID, owner, afterID)
}

func (h *Handler) pollJobEvents(
	ctx context.Context,
	streamer sseStreamer,
	jobID int64,
	owner service.Owner,
	afterID int64,
) {
	pollTicker := time.NewTicker(h.config.SSEPollInterval)
	heartbeatTicker := time.NewTicker(h.config.SSEKeepAliveInterval)
	defer pollTicker.Stop()
	defer heartbeatTicker.Stop()
	for {
		cursor, done, err := h.writeAvailableJobEvents(ctx, streamer, jobID, owner, afterID)
		if err != nil {
			writeSSEError(streamer, err)
			return
		}
		afterID = cursor
		if done || !waitForNextSSETick(ctx, streamer, heartbeatTicker.C, pollTicker.C, jobID) {
			return
		}
	}
}

func (h *Handler) writeAvailableJobEvents(
	ctx context.Context,
	streamer sseStreamer,
	jobID int64,
	owner service.Owner,
	afterID int64,
) (int64, bool, error) {
	events, err := h.reader.GetPublicEvents(ctx, jobID, owner, afterID, sseEventBatchLimit)
	if err != nil {
		return afterID, false, err
	}
	for _, event := range events {
		if err := writeStoredJobEvent(streamer, event); err != nil {
			return afterID, false, err
		}
		afterID = event.ID
		if isTerminalEvent(event.EventType) {
			return afterID, true, nil
		}
	}
	return afterID, false, nil
}

func waitForNextSSETick(
	ctx context.Context,
	streamer sseStreamer,
	heartbeat <-chan time.Time,
	poll <-chan time.Time,
	jobID int64,
) bool {
	for {
		select {
		case <-ctx.Done():
			return false
		case <-heartbeat:
			_ = streamer.WriteEvent("heartbeat", map[string]any{"job_id": jobID}, nil)
		case <-poll:
			return true
		}
	}
}

func eventCursorFromRequest(r *http.Request) (int64, error) {
	if header := strings.TrimSpace(r.Header.Get("Last-Event-ID")); header != "" {
		return parseEventCursor(header)
	}
	return parseEventCursor(strings.TrimSpace(r.URL.Query().Get("since_event_id")))
}

func parseEventCursor(value string) (int64, error) {
	if value == "" {
		return 0, nil
	}
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id < 0 {
		return 0, fmt.Errorf("invalid event cursor %q", value)
	}
	return id, nil
}

func writeStoredJobEvent(streamer sseStreamer, event service.JobEventPayload) error {
	payload := event.Payload
	if payload == nil {
		payload = map[string]any{"id": event.JobID}
	}
	return streamer.WriteEvent(sseEventName(event.EventType), payload, &event.ID)
}

func sseEventName(eventType string) string {
	switch eventType {
	case "image_job.succeeded":
		return "job_succeeded"
	case "image_job.failed", "image_job.cancelled":
		return "job_failed"
	case "image_job.started", "image_job_item.started":
		return "item_started"
	case "image_job_item.succeeded":
		return "item_succeeded"
	case "image_job_item.failed", "image_job_item.dead_lettered":
		return "item_failed"
	case "image_job_item.cancelled":
		return "item_cancelled"
	case "image_job_item.retry_scheduled":
		return "item_retry_scheduled"
	case "image_job.created":
		return "job_snapshot"
	default:
		return strings.ReplaceAll(eventType, ".", "_")
	}
}

func isTerminalEvent(eventType string) bool {
	return eventType == "image_job.succeeded" ||
		eventType == "image_job.failed" ||
		eventType == "image_job.cancelled"
}

type sseStreamer interface {
	WriteEvent(name string, payload any, eventID *int64) error
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

func (s httpSSEStreamer) WriteEvent(name string, payload any, eventID *int64) error {
	content, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if eventID != nil {
		if _, err := fmt.Fprintf(s.writer, "id: %d\n", *eventID); err != nil {
			return err
		}
	}
	if _, err := fmt.Fprintf(s.writer, "event: %s\ndata: %s\n\n", name, content); err != nil {
		return err
	}
	s.flusher.Flush()
	return nil
}

func writeSSEError(streamer sseStreamer, err error) {
	_ = streamer.WriteEvent("job_failed", map[string]any{"error": err.Error()}, nil)
}

func publicJobEventPayload(job *service.JobPayload) map[string]any {
	return map[string]any{"id": job.ID, "status": job.Status}
}
