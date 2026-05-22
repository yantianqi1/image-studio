package service

import "errors"

var ErrNotFound = errors.New("image job not found")
var ErrInvalidInput = errors.New("invalid image job request")
var ErrUnauthorized = errors.New("authentication required")
var ErrForbidden = errors.New("forbidden")
var ErrUnsupported = errors.New("unsupported asset operation")

type Owner struct {
	UserID             *int64
	AnonymousSessionID *int64
}

type OwnerTokens struct {
	UserSessionToken      string
	AnonymousSessionToken string
}

type JobPayload struct {
	ID                    int64   `json:"id"`
	UserID                *int64  `json:"user_id"`
	Source                string  `json:"source"`
	Mode                  string  `json:"mode"`
	Title                 *string `json:"title"`
	Prompt                string  `json:"prompt"`
	ModelCode             string  `json:"model_code"`
	Visibility            string  `json:"visibility"`
	SourceAssetID         *int64  `json:"source_asset_id"`
	ProviderID            *int64  `json:"provider_id"`
	ProviderModel         *string `json:"provider_model"`
	ClientProviderBaseURL *string `json:"client_provider_base_url"`
	Status                string  `json:"status"`
	RequestedCount        int     `json:"requested_count"`
	AttemptCount          int     `json:"attempt_count"`
	MaxAttempts           int     `json:"max_attempts"`
	Size                  *string `json:"size"`
	Quality               *string `json:"quality"`
	ProviderInputTokens   *int64  `json:"provider_input_tokens"`
	ProviderOutputTokens  *int64  `json:"provider_output_tokens"`
	ProviderTotalTokens   *int64  `json:"provider_total_tokens"`
	RawProviderCostCents  *int64  `json:"raw_provider_cost_cents"`
	ProviderFeeCents      *int64  `json:"provider_fee_cents"`
	InternalCostCents     *int64  `json:"internal_cost_cents"`
	ErrorCode             *string `json:"error_code"`
	ErrorMessage          *string `json:"error_message"`
	CreatedAt             string  `json:"created_at"`
	AvailableAt           string  `json:"available_at"`
	StartedAt             *string `json:"started_at"`
	FinishedAt            *string `json:"finished_at"`
}

type ResultPayload struct {
	ID                int64   `json:"id"`
	JobID             int64   `json:"job_id"`
	ResultIndex       int     `json:"result_index"`
	AssetID           int64   `json:"asset_id"`
	AssetURL          string  `json:"asset_url"`
	ThumbnailURL      string  `json:"thumbnail_url"`
	Visibility        string  `json:"visibility"`
	PublishedAt       *string `json:"published_at"`
	CreatedAt         string  `json:"created_at"`
	RevisedPrompt     *string `json:"revised_prompt"`
	ProviderRequestID *string `json:"provider_request_id"`
}

type ItemPayload struct {
	ID               int64   `json:"id"`
	JobID            int64   `json:"job_id"`
	ResultIndex      int     `json:"result_index"`
	Status           string  `json:"status"`
	AssetID          *int64  `json:"asset_id"`
	ErrorCode        *string `json:"error_code"`
	ErrorMessage     *string `json:"error_message"`
	ManualRetryCount int     `json:"manual_retry_count"`
	CreatedAt        string  `json:"created_at"`
	AvailableAt      string  `json:"available_at"`
	StartedAt        *string `json:"started_at"`
	FinishedAt       *string `json:"finished_at"`
	CancelledAt      *string `json:"cancelled_at"`
}

type GalleryItemPayload struct {
	AssetID       int64   `json:"asset_id"`
	AssetURL      string  `json:"asset_url"`
	ThumbnailURL  string  `json:"thumbnail_url"`
	Visibility    string  `json:"visibility"`
	PublishedAt   *string `json:"published_at"`
	CreatedAt     string  `json:"created_at"`
	JobID         int64   `json:"job_id"`
	ResultIndex   int     `json:"result_index"`
	Prompt        string  `json:"prompt"`
	RevisedPrompt *string `json:"revised_prompt"`
}

type DeleteJobPayload struct {
	Deleted bool   `json:"deleted"`
	ID      string `json:"id"`
}

type JobEventPayload struct {
	ID        int64          `json:"id"`
	JobID     int64          `json:"job_id"`
	ItemID    *int64         `json:"item_id"`
	EventType string         `json:"event_type"`
	Payload   map[string]any `json:"payload"`
	CreatedAt string         `json:"created_at"`
}

type AssetContent struct {
	Content  []byte
	MimeType string
}

type DebugPayload struct {
	JobID       int64            `json:"job_id"`
	Job         *JobPayload      `json:"job,omitempty"`
	Items       []map[string]any `json:"items,omitempty"`
	ResultCount int              `json:"result_count,omitempty"`
}

type CreateJobRequest struct {
	Owner                Owner
	Prompt               string
	ModelCode            string
	RequestedCount       int
	Mode                 string
	SourceAssetID        *int64
	ReferenceAssetIDs    []int64
	ConversationMessages []map[string]any
	Visibility           string
	Size                 string
	Quality              string
	ClientProviderConfig map[string]any
}

type ClientProviderConfig struct {
	ClientID string
	BaseURL  string
	APIKey   string
}

type PublicCreateJobRequest struct {
	OwnerTokens          OwnerTokens
	RequestIP            string
	Prompt               string
	ModelCode            string
	RequestedCount       int
	Mode                 string
	SourceAssetID        *int64
	ReferenceAssetIDs    []int64
	CharacterLibraryIDs  []int64
	ConversationMessages []map[string]any
	Visibility           string
	Size                 string
	Quality              string
	AutoTitle            bool
	ClientProviderConfig *ClientProviderConfig
}

type PublicCreateJobResult struct {
	Job                   *JobPayload
	AnonymousSessionToken *string
	Owner                 Owner `json:"-"`
}
