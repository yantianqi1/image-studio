package provider

import "context"

const (
	OpenAIChatCompatibleType = "openai-chat-compatible"
	OpenAICompatibleType     = "openai-compatible"
	OpenRouterChatImageType  = "openrouter-chat-image"
	LocalDevProviderType     = "local-dev"
)

type Renderer interface {
	Render(ctx context.Context, job JobContext) (*RenderedImage, error)
}

type RendererFactory interface {
	RendererFor(job JobContext) (Renderer, error)
}

type JobContext struct {
	ItemID                  int64
	ID                      int64
	ResultIndex             int
	UserID                  *int64
	AnonymousSessionID      *int64
	ClientAccessID          *string
	Prompt                  string
	ProviderModel           string
	RequestedCount          int
	AttemptCount            int
	MaxAttempts             int
	StorageSubdir           string
	Visibility              string
	Size                    string
	Quality                 string
	ClientProviderConfigRaw string
	Provider                ProviderConfig
	SourceAsset             *AssetRef
	ReferenceAssets         []AssetRef
	ConversationAssets      []AssetRef
	ConversationMessages    []map[string]any
}

type ProviderConfig struct {
	ID           int64
	Name         string
	Type         string
	BaseURL      string
	APIKeyEnv    string
	DefaultModel string
	Status       string
}

type AssetRef struct {
	ID          int64
	StoragePath string
	MimeType    string
}

type RenderedImage struct {
	Content           []byte
	URL               *string
	MimeType          string
	RevisedPrompt     *string
	ProviderRequestID *string
	Usage             *Usage
}

type Usage struct {
	InputTokens          *int64
	OutputTokens         *int64
	TotalTokens          *int64
	RawProviderCostCents *int64
	ProviderFeeCents     *int64
	InternalCostCents    *int64
	RawPayload           map[string]any
}
