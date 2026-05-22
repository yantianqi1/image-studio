package httpapi

import "net/http"

const defaultGalleryScope = "mine"

func (h Handler) handlePublicGallery(w http.ResponseWriter, r *http.Request) {
	owner, err := h.ownerFromPublicRequest(r)
	if err != nil {
		writeServiceResult(w, nil, err)
		return
	}
	items, err := h.reader.GetPublicGallery(r.Context(), owner, galleryScope(r))
	writeServiceResult(w, items, err)
}

func galleryScope(r *http.Request) string {
	scope := r.URL.Query().Get("scope")
	if scope == "" {
		return defaultGalleryScope
	}
	return scope
}
