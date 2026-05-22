package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/yantianqi1/image-studio/apps/image-api-go/internal/service"
)

func (h Handler) handlePublicJob(w http.ResponseWriter, r *http.Request, path string) {
	jobID, suffix, ok := parsePublicJobPath(path)
	if !ok {
		http.NotFound(w, r)
		return
	}
	owner, err := h.ownerFromPublicRequest(r)
	if err != nil {
		writeServiceResult(w, nil, err)
		return
	}
	if suffix == "results" {
		h.writePublicResults(w, r, jobID, owner)
		return
	}
	if suffix == "events" {
		h.writePublicEvents(w, r, jobID, owner)
		return
	}
	if suffix == "items" {
		h.writePublicItems(w, r, jobID, owner)
		return
	}
	job, err := h.reader.GetPublicJob(r.Context(), jobID, owner)
	writeServiceResult(w, job, err)
}

func (h Handler) writePublicResults(w http.ResponseWriter, r *http.Request, jobID int64, owner service.Owner) {
	results, err := h.reader.GetPublicResults(r.Context(), jobID, owner)
	writeServiceResult(w, results, err)
}

func (h Handler) writePublicItems(w http.ResponseWriter, r *http.Request, jobID int64, owner service.Owner) {
	items, err := h.reader.GetPublicItems(r.Context(), jobID, owner)
	writeServiceResult(w, items, err)
}

func parsePublicJobPath(path string) (int64, string, bool) {
	parts := strings.Split(path, "/")
	if len(parts) != 5 && len(parts) != 6 {
		return 0, "", false
	}
	id, err := strconv.ParseInt(parts[4], 10, 64)
	if err != nil {
		return 0, "", false
	}
	if len(parts) == 6 {
		return id, parts[5], parts[5] == "results" || parts[5] == "events" || parts[5] == "items"
	}
	return id, "", true
}
