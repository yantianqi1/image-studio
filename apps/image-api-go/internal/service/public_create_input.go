package service

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

type publicCreateInput struct {
	Owner                Owner
	Source               string
	Title                *string
	Prompt               string
	ModelCode            string
	RequestedCount       int
	Mode                 string
	SourceAssetID        *int64
	ProviderID           int64
	ProviderModel        string
	ClientAccessID       *string
	ClientProviderConfig map[string]string
	ConversationMessages []map[string]any
	Visibility           string
	Size                 string
	Quality              string
	ReferenceAssetIDs    []int64
}

type publicCreateBuildOptions struct {
	Request PublicCreateJobRequest
	Owner   Owner
	Target  modelTarget
}

type publicCreateValueOptions struct {
	Request       PublicCreateJobRequest
	Owner         Owner
	Target        modelTarget
	SourceAssetID *int64
	Characters    characterBundle
	ReferenceIDs  []int64
}

type insertPublicItemsOptions struct {
	JobID int64
	Count int
}

type insertPublicReferencesOptions struct {
	JobID    int64
	AssetIDs []int64
}

func (r *Repository) buildPublicCreateInput(
	ctx context.Context,
	tx pgx.Tx,
	options publicCreateBuildOptions,
) (publicCreateInput, error) {
	sourceAssetID, err := r.resolveSourceAssetID(ctx, tx, sourceAssetOptions{
		Request: options.Request,
		Owner:   options.Owner,
	})
	if err != nil {
		return publicCreateInput{}, err
	}
	characters, err := resolveCharacterBundle(ctx, tx, characterBundleOptions{
		Owner:        options.Owner,
		CharacterIDs: options.Request.CharacterLibraryIDs,
		Prompt:       options.Request.Prompt,
	})
	if err != nil {
		return publicCreateInput{}, err
	}
	referenceIDs := make([]int64, 0, len(options.Request.ReferenceAssetIDs)+len(characters.AssetIDs))
	referenceIDs = append(referenceIDs, options.Request.ReferenceAssetIDs...)
	referenceIDs = append(referenceIDs, characters.AssetIDs...)
	referenceIDs, err = resolveReferenceAssetIDs(ctx, tx, referenceAssetOptions{
		AssetIDs: referenceIDs,
		Owner:    options.Owner,
	})
	if err != nil {
		return publicCreateInput{}, err
	}
	if err := validateConversationMessageAssets(ctx, tx, conversationAssetOptions{
		Messages: options.Request.ConversationMessages,
		Owner:    options.Owner,
	}); err != nil {
		return publicCreateInput{}, err
	}
	return buildPublicCreateInputValue(publicCreateValueOptions{
		Request:       options.Request,
		Owner:         options.Owner,
		Target:        options.Target,
		SourceAssetID: sourceAssetID,
		Characters:    characters,
		ReferenceIDs:  referenceIDs,
	})
}

func buildPublicCreateInputValue(options publicCreateValueOptions) (publicCreateInput, error) {
	clientConfig, err := serializeClientProviderConfig(
		options.Request.ClientProviderConfig,
		options.Target.ProviderType,
	)
	if err != nil {
		return publicCreateInput{}, err
	}
	return publicCreateInput{
		Owner:                options.Owner,
		Source:               imageJobSource(options.Owner, options.Request.ClientProviderConfig),
		Title:                imageJobTitle(options.Request.AutoTitle),
		Prompt:               options.Characters.Prompt,
		ModelCode:            options.Request.ModelCode,
		RequestedCount:       options.Request.RequestedCount,
		Mode:                 options.Request.Mode,
		SourceAssetID:        options.SourceAssetID,
		ProviderID:           options.Target.ProviderID,
		ProviderModel:        options.Target.ProviderModel,
		ClientAccessID:       clientAccessID(options.Request.ClientProviderConfig),
		ClientProviderConfig: clientConfig,
		ConversationMessages: options.Request.ConversationMessages,
		Visibility:           defaultString(options.Request.Visibility, "private"),
		Size:                 options.Request.Size,
		Quality:              options.Request.Quality,
		ReferenceAssetIDs:    options.ReferenceIDs,
	}, nil
}

func insertPublicJob(ctx context.Context, tx pgx.Tx, input publicCreateInput) (int64, error) {
	args, err := publicCreateJobArgs(input)
	if err != nil {
		return 0, err
	}
	var jobID int64
	if err := tx.QueryRow(ctx, insertPublicJobSQL, args...).Scan(&jobID); err != nil {
		return 0, fmt.Errorf("insert public image job: %w", err)
	}
	if err := insertPublicItems(ctx, tx, insertPublicItemsOptions{
		JobID: jobID,
		Count: input.RequestedCount,
	}); err != nil {
		return 0, err
	}
	if err := insertPublicReferences(ctx, tx, insertPublicReferencesOptions{
		JobID:    jobID,
		AssetIDs: input.ReferenceAssetIDs,
	}); err != nil {
		return 0, err
	}
	return jobID, recordCreatedEvent(ctx, tx, jobID)
}

func recordCreatedEvent(ctx context.Context, tx pgx.Tx, jobID int64) error {
	return recordImageJobEventTx(ctx, tx, imageJobEventRecord{
		JobID:     jobID,
		EventType: "image_job.created",
		Payload:   map[string]any{"id": jobID, "status": "queued"},
	})
}

func publicCreateJobArgs(input publicCreateInput) ([]any, error) {
	clientConfig, err := jsonString(input.ClientProviderConfig)
	if err != nil {
		return nil, fmt.Errorf("serialize client provider config: %w", err)
	}
	messages, err := jsonString(input.ConversationMessages)
	if err != nil {
		return nil, fmt.Errorf("serialize conversation messages: %w", err)
	}
	return []any{
		int64OrNil(input.Owner.UserID), int64OrNil(input.Owner.AnonymousSessionID),
		input.Source, input.Mode, stringOrNil(input.Title), input.Prompt, input.ModelCode,
		int64OrNil(input.SourceAssetID), input.ProviderID, input.ProviderModel,
		stringOrNil(input.ClientAccessID), clientConfig, messages, input.Visibility,
		input.RequestedCount, input.Size, input.Quality,
	}, nil
}

func insertPublicItems(ctx context.Context, tx pgx.Tx, options insertPublicItemsOptions) error {
	for resultIndex := 1; resultIndex <= options.Count; resultIndex++ {
		if _, err := tx.Exec(ctx, insertPublicItemSQL, options.JobID, resultIndex); err != nil {
			return fmt.Errorf("insert public image job item: %w", err)
		}
	}
	return nil
}

func insertPublicReferences(ctx context.Context, tx pgx.Tx, options insertPublicReferencesOptions) error {
	for index, assetID := range options.AssetIDs {
		if _, err := tx.Exec(ctx, insertPublicReferenceSQL, options.JobID, assetID, index+1); err != nil {
			return fmt.Errorf("insert public image job reference: %w", err)
		}
	}
	return nil
}

func jobPayloadFromInput(jobID int64, input publicCreateInput) *JobPayload {
	return &JobPayload{
		ID:             jobID,
		Status:         "queued",
		Prompt:         input.Prompt,
		ModelCode:      input.ModelCode,
		Mode:           input.Mode,
		RequestedCount: input.RequestedCount,
		Visibility:     input.Visibility,
	}
}

func imageJobSource(owner Owner, clientConfig *ClientProviderConfig) string {
	if clientConfig != nil {
		return clientProviderSource
	}
	if owner.UserID != nil {
		return memberSource
	}
	return anonymousSource
}

func imageJobTitle(autoTitle bool) *string {
	if !autoTitle {
		return nil
	}
	title := pendingImageJobTitle
	return &title
}

func clientAccessID(config *ClientProviderConfig) *string {
	if config == nil {
		return nil
	}
	value := config.ClientID
	return &value
}

func stringOrNil(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}
