package httpapi

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"

	"github.com/yantianqi1/image-studio/apps/image-api-go/internal/service"
)

const maxClientIDLength = 128

func (h Handler) handleInternalCreate(w http.ResponseWriter, r *http.Request) {
	if !h.config.EnableInternalCreate {
		http.Error(w, "internal create disabled", http.StatusForbidden)
		return
	}
	owner, err := h.ownerFromInternalCreateRequest(r)
	if err != nil {
		writeServiceResult(w, nil, err)
		return
	}
	request, err := decodeCreateJobRequest(r, owner)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	job, err := h.reader.CreateInternalJob(r.Context(), request)
	writeServiceResultWithStatus(w, job, err, http.StatusCreated)
}

func (h Handler) handlePublicCreate(w http.ResponseWriter, r *http.Request) {
	if !h.config.EnablePublicCreate {
		http.Error(w, "public create disabled", http.StatusForbidden)
		return
	}
	request, err := decodePublicCreateRequest(r, h.config)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	result, err := h.reader.CreatePublicJob(r.Context(), request)
	if result != nil && result.AnonymousSessionToken != nil {
		h.setAnonymousSessionCookie(w, *result.AnonymousSessionToken)
	}
	writeServiceResultWithStatus(w, jobFromPublicCreate(result), err, http.StatusCreated)
}

func decodeCreateJobRequest(r *http.Request, owner service.Owner) (service.CreateJobRequest, error) {
	var payload createJobPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		return service.CreateJobRequest{}, err
	}
	if strings.TrimSpace(payload.Prompt) == "" || strings.TrimSpace(payload.ModelCode) == "" {
		return service.CreateJobRequest{}, errors.New("prompt and model_code are required")
	}
	if payload.RequestedCount < 1 {
		return service.CreateJobRequest{}, errors.New("requested_count must be at least 1")
	}
	return payload.toRequest(owner), nil
}

type createJobPayload struct {
	Prompt               string           `json:"prompt"`
	ModelCode            string           `json:"model_code"`
	RequestedCount       int              `json:"requested_count"`
	Mode                 string           `json:"mode"`
	SourceAssetID        *int64           `json:"source_asset_id"`
	ReferenceAssetIDs    []int64          `json:"reference_asset_ids"`
	ConversationMessages []map[string]any `json:"conversation_messages"`
	Visibility           string           `json:"visibility"`
	Size                 string           `json:"size"`
	Quality              string           `json:"quality"`
	CharacterLibraryIDs  []int64          `json:"character_library_ids"`
	AutoTitle            bool             `json:"auto_title"`
	ClientProviderConfig map[string]any   `json:"client_provider_config"`
}

func (p createJobPayload) toRequest(owner service.Owner) service.CreateJobRequest {
	mode := p.Mode
	if mode == "" {
		mode = "generate"
	}
	return service.CreateJobRequest{
		Owner: owner, Prompt: p.Prompt, ModelCode: p.ModelCode,
		RequestedCount: p.RequestedCount, Mode: mode, SourceAssetID: p.SourceAssetID,
		ReferenceAssetIDs: p.ReferenceAssetIDs, ConversationMessages: p.ConversationMessages,
		Visibility: p.Visibility, Size: p.Size, Quality: p.Quality,
		ClientProviderConfig: p.ClientProviderConfig,
	}
}

func decodePublicCreateRequest(r *http.Request, config Config) (service.PublicCreateJobRequest, error) {
	var payload createJobPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		return service.PublicCreateJobRequest{}, err
	}
	clientConfig, err := clientProviderConfigFromHeaders(r)
	if err != nil {
		return service.PublicCreateJobRequest{}, err
	}
	if strings.TrimSpace(payload.Prompt) == "" || strings.TrimSpace(payload.ModelCode) == "" {
		return service.PublicCreateJobRequest{}, errors.New("prompt and model_code are required")
	}
	return payload.toPublicRequest(config, r, clientConfig), nil
}

func (p createJobPayload) toPublicRequest(
	config Config,
	r *http.Request,
	clientConfig *service.ClientProviderConfig,
) service.PublicCreateJobRequest {
	return service.PublicCreateJobRequest{
		OwnerTokens: service.OwnerTokens{
			UserSessionToken:      cookieValue(r, config.UserSessionCookieName),
			AnonymousSessionToken: cookieValue(r, config.AnonymousSessionCookieName),
		},
		RequestIP:            requestIP(r),
		Prompt:               p.Prompt,
		ModelCode:            p.ModelCode,
		RequestedCount:       defaultRequestedCount(p.RequestedCount),
		Mode:                 defaultString(p.Mode, "generate"),
		SourceAssetID:        p.SourceAssetID,
		ReferenceAssetIDs:    p.ReferenceAssetIDs,
		CharacterLibraryIDs:  p.CharacterLibraryIDs,
		ConversationMessages: p.ConversationMessages,
		Visibility:           p.Visibility,
		Size:                 p.Size,
		Quality:              p.Quality,
		AutoTitle:            p.AutoTitle,
		ClientProviderConfig: clientConfig,
	}
}

func clientProviderConfigFromHeaders(r *http.Request) (*service.ClientProviderConfig, error) {
	clientID := normalizeHeader(r.Header.Get("X-Client-Id"))
	baseURL := normalizeHeader(r.Header.Get("X-Client-Provider-Base-Url"))
	apiKey := normalizeHeader(r.Header.Get("X-Client-Provider-Api-Key"))
	if clientID == "" && baseURL == "" && apiKey == "" {
		return nil, nil
	}
	if clientID == "" || apiKey == "" {
		return nil, errors.New("client id and api key are required together")
	}
	if len(clientID) > maxClientIDLength {
		return nil, errors.New("client id is too long")
	}
	if baseURL != "" && !strings.HasPrefix(baseURL, "http://") && !strings.HasPrefix(baseURL, "https://") {
		return nil, errors.New("client provider base url must be http or https")
	}
	return &service.ClientProviderConfig{ClientID: clientID, BaseURL: baseURL, APIKey: apiKey}, nil
}

func normalizeHeader(value string) string {
	return strings.TrimSpace(value)
}

func defaultString(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func defaultRequestedCount(value int) int {
	if value == 0 {
		return 1
	}
	return value
}

func requestIP(r *http.Request) string {
	forwardedFor := normalizeHeader(r.Header.Get("X-Forwarded-For"))
	if forwardedFor != "" {
		return normalizeHeader(strings.SplitN(forwardedFor, ",", 2)[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return normalizeHeader(host)
	}
	return normalizeHeader(r.RemoteAddr)
}

func (h Handler) setAnonymousSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     h.config.AnonymousSessionCookieName,
		Value:    token,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   h.config.AnonymousSessionCookieSecure,
		MaxAge:   h.config.AnonymousSessionMaxAgeSeconds,
		Path:     "/",
	})
}

func jobFromPublicCreate(result *service.PublicCreateJobResult) *service.JobPayload {
	if result == nil {
		return nil
	}
	return result.Job
}
