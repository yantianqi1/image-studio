package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/yantianqi1/image-studio/apps/image-api-go/internal/service"
)

var publicAssetCacheHeaders = map[string]string{
	"Cache-Control":     "public, max-age=86400, s-maxage=604800",
	"CDN-Cache-Control": "public, max-age=604800",
}

func (h Handler) handlePublicAsset(w http.ResponseWriter, r *http.Request, path string) {
	assetID, thumbnail, ok := parsePublicAssetPath(path)
	if !ok {
		http.NotFound(w, r)
		return
	}
	owner, err := h.ownerFromPublicRequest(r)
	if err != nil {
		writeServiceResult(w, nil, err)
		return
	}
	asset, err := h.loadPublicAsset(r, assetID, thumbnail, owner)
	if err != nil {
		writeServiceResult(w, nil, err)
		return
	}
	writeAssetContent(w, asset)
}

func (h Handler) loadPublicAsset(r *http.Request, assetID int64, thumbnail bool, owner service.Owner) (*service.AssetContent, error) {
	if thumbnail {
		return h.reader.GetPublicAssetThumbnail(r.Context(), assetID, owner)
	}
	return h.reader.GetPublicAsset(r.Context(), assetID, owner)
}

func parsePublicAssetPath(path string) (int64, bool, bool) {
	parts := strings.Split(path, "/")
	if len(parts) != 5 && len(parts) != 6 {
		return 0, false, false
	}
	id, err := strconv.ParseInt(parts[4], 10, 64)
	if err != nil {
		return 0, false, false
	}
	if len(parts) == 6 {
		return id, parts[5] == "thumbnail", parts[5] == "thumbnail"
	}
	return id, false, true
}

func writeAssetContent(w http.ResponseWriter, asset *service.AssetContent) {
	for key, value := range publicAssetCacheHeaders {
		w.Header().Set(key, value)
	}
	w.Header().Set("Content-Type", asset.MimeType)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(asset.Content)
}
