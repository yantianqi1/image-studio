package service

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestInsertPublicItemsCreatesOneRowPerRequestedResult(t *testing.T) {
	tx := &recordingTx{}

	err := insertPublicItems(context.Background(), tx, insertPublicItemsOptions{JobID: 44, Count: 3})

	if err != nil {
		t.Fatalf("insertPublicItems returned error: %v", err)
	}
	if len(tx.execArgs) != 3 {
		t.Fatalf("insert count = %d, want 3", len(tx.execArgs))
	}
	for index, args := range tx.execArgs {
		wantResultIndex := index + 1
		if args[0] != int64(44) || args[1] != wantResultIndex {
			t.Fatalf("insert args[%d] = %#v", index, args)
		}
	}
}

func TestValidateCreateSettingsRejectsUploadsWhenDisabled(t *testing.T) {
	userID := int64(7)
	cases := []PublicCreateJobRequest{
		{Prompt: "edit", ModelCode: "gpt-image-2", RequestedCount: 1, Mode: "edit"},
		{Prompt: "ref", ModelCode: "gpt-image-2", RequestedCount: 1, Mode: "generate", ReferenceAssetIDs: []int64{9}},
	}

	for _, request := range cases {
		err := validateCreateSettings(
			siteSettings{AllowAnonymousImage: true, UploadsEnabled: false},
			request,
			Owner{UserID: &userID},
		)
		if !errors.Is(err, ErrForbidden) {
			t.Fatalf("validateCreateSettings(%#v) error = %v, want forbidden", request, err)
		}
	}
}

func TestClientProviderCreateUsesClientSourceWithoutAnonymousQuota(t *testing.T) {
	anonymousID := int64(11)
	request := clientProviderPublicCreateRequest()

	input, err := buildPublicCreateInputValue(publicCreateValueOptions{
		Request: request,
		Owner:   Owner{AnonymousSessionID: &anonymousID},
		Target:  modelTarget{ProviderID: 3, ProviderModel: "openai/gpt-image-2", ProviderType: openAIProviderType},
	})

	if err != nil {
		t.Fatalf("buildPublicCreateInputValue returned error: %v", err)
	}
	if input.Source != clientProviderSource {
		t.Fatalf("source = %q, want %q", input.Source, clientProviderSource)
	}
	if shouldConsumePublicQuota(input.Owner, request.ClientProviderConfig) {
		t.Fatalf("client_provider_config create should not consume anonymous quota")
	}
	if input.ClientProviderConfig["base_url"] != "https://client.example/v1" {
		t.Fatalf("client provider config = %#v", input.ClientProviderConfig)
	}
}

func clientProviderPublicCreateRequest() PublicCreateJobRequest {
	return PublicCreateJobRequest{
		Prompt: "Client render", ModelCode: "gpt-image-2", RequestedCount: 1,
		Mode: "generate", ClientProviderConfig: &ClientProviderConfig{
			ClientID: "browser-client", BaseURL: "https://client.example/v1", APIKey: "sk-client",
		},
	}
}

type recordingTx struct {
	pgx.Tx
	execArgs [][]any
}

func (tx *recordingTx) Exec(_ context.Context, _ string, args ...any) (pgconn.CommandTag, error) {
	tx.execArgs = append(tx.execArgs, append([]any(nil), args...))
	return pgconn.NewCommandTag("INSERT 0 1"), nil
}
