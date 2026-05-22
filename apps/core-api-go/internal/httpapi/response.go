package httpapi

import (
	"encoding/json"
	"net/http"
)

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type envelope struct {
	Data  any            `json:"data"`
	Meta  map[string]any `json:"meta"`
	Error *errorBody     `json:"error"`
}

func writeData(w http.ResponseWriter, data any) {
	writeJSON(w, http.StatusOK, envelope{
		Data:  data,
		Meta:  map[string]any{},
		Error: nil,
	})
}

func writeError(w http.ResponseWriter, status int, code string, message string) {
	writeJSON(w, status, envelope{
		Data:  nil,
		Meta:  map[string]any{},
		Error: &errorBody{Code: code, Message: message},
	})
}

func writeJSON(w http.ResponseWriter, status int, payload envelope) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
