package httpapi

import "net/http"

func (h Handler) handlePublicDeleteJob(w http.ResponseWriter, r *http.Request, path string) {
	jobID, suffix, ok := parsePublicJobPath(path)
	if !ok || suffix != "" {
		http.NotFound(w, r)
		return
	}
	owner, err := h.ownerFromPublicRequest(r)
	if err != nil {
		writeServiceResult(w, nil, err)
		return
	}
	payload, err := h.reader.DeletePublicJob(r.Context(), jobID, owner)
	writeServiceResult(w, payload, err)
}
