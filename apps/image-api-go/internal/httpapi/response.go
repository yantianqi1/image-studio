package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/yantianqi1/image-studio/apps/image-api-go/internal/service"
)

func writeServiceResult(w http.ResponseWriter, data any, err error) {
	writeServiceResultWithStatus(w, data, err, http.StatusOK)
}

func writeServiceResultWithStatus(w http.ResponseWriter, data any, err error, status int) {
	if errors.Is(err, service.ErrNotFound) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if errors.Is(err, service.ErrUnauthorized) {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	if errors.Is(err, service.ErrForbidden) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if errors.Is(err, service.ErrInvalidInput) {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	if errors.Is(err, service.ErrUnsupported) {
		http.Error(w, err.Error(), http.StatusUnsupportedMediaType)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeDataWithStatus(w, data, status)
}

func writeData(w http.ResponseWriter, data any) {
	writeDataWithStatus(w, data, http.StatusOK)
}

func writeDataWithStatus(w http.ResponseWriter, data any, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data":  data,
		"meta":  map[string]any{},
		"error": nil,
	})
}
