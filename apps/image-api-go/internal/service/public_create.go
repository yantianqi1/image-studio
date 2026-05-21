package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

const (
	clientProviderSource = "client_provider"
	memberSource         = "member"
	anonymousSource      = "anonymous"
	pendingImageJobTitle = "__image_job_title_pending__"
)

type modelTarget struct {
	ProviderID    int64
	ProviderModel string
	ProviderType  string
}

type siteSettings struct {
	AllowAnonymousImage         bool
	UploadsEnabled              bool
	PublicQuotaMode             string
	PublicQuotaDailyGlobalLimit int
	PublicQuotaPerIPLimit       int
}

type publicCreateTxOptions struct {
	Request PublicCreateJobRequest
	Target  modelTarget
}

func (r *Repository) CreatePublicJob(
	ctx context.Context,
	request PublicCreateJobRequest,
) (*PublicCreateJobResult, error) {
	if err := validatePublicCreateRequest(request); err != nil {
		return nil, err
	}
	target, err := r.resolveModelTarget(ctx, request.ModelCode)
	if err != nil {
		return nil, err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin public image job create: %w", err)
	}
	defer tx.Rollback(ctx)
	result, err := r.createPublicJobInTx(ctx, tx, publicCreateTxOptions{Request: request, Target: target})
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit public image job create: %w", err)
	}
	job, err := r.GetPublicJob(ctx, result.Job.ID, result.Owner)
	if err != nil {
		return nil, err
	}
	result.Job = job
	return result, nil
}

func (r *Repository) createPublicJobInTx(
	ctx context.Context,
	tx pgx.Tx,
	options publicCreateTxOptions,
) (*PublicCreateJobResult, error) {
	owner, token, err := r.ensureCreateOwner(ctx, tx, options.Request.OwnerTokens)
	if err != nil {
		return nil, err
	}
	settings, err := ensureSiteSettings(ctx, tx)
	if err != nil {
		return nil, err
	}
	if err := validateCreateSettings(settings, options.Request, owner); err != nil {
		return nil, err
	}
	createInput, err := r.buildPublicCreateInput(ctx, tx, publicCreateBuildOptions{
		Request: options.Request,
		Owner:   owner,
		Target:  options.Target,
	})
	if err != nil {
		return nil, err
	}
	jobID, err := insertPublicJob(ctx, tx, createInput)
	if err != nil {
		return nil, err
	}
	if shouldConsumePublicQuota(owner, options.Request.ClientProviderConfig) {
		if err := r.consumePublicQuota(ctx, tx, publicQuotaConsumeOptions{
			Settings: settings,
			Request:  options.Request,
			JobID:    jobID,
		}); err != nil {
			return nil, err
		}
	}
	return &PublicCreateJobResult{
		Job:                   jobPayloadFromInput(jobID, createInput),
		AnonymousSessionToken: token,
		Owner:                 owner,
	}, nil
}

func validatePublicCreateRequest(request PublicCreateJobRequest) error {
	if strings.TrimSpace(request.Prompt) == "" || strings.TrimSpace(request.ModelCode) == "" {
		return fmt.Errorf("%w: prompt and model_code are required", ErrInvalidInput)
	}
	if request.RequestedCount < 1 || request.RequestedCount > 4 {
		return fmt.Errorf("%w: requested_count must be between 1 and 4", ErrInvalidInput)
	}
	if request.Mode != "generate" && request.Mode != "edit" {
		return fmt.Errorf("%w: mode is invalid", ErrInvalidInput)
	}
	if request.Visibility != "" && request.Visibility != "private" && request.Visibility != "public" {
		return fmt.Errorf("%w: visibility is invalid", ErrInvalidInput)
	}
	if request.Quality != "" && !validQuality(request.Quality) {
		return fmt.Errorf("%w: quality is invalid", ErrInvalidInput)
	}
	if err := validateCreateAssetIDs(request); err != nil {
		return err
	}
	return validateClientProviderConfig(request.ClientProviderConfig)
}

func validQuality(value string) bool {
	return value == "low" || value == "medium" || value == "high"
}

func validateCreateAssetIDs(request PublicCreateJobRequest) error {
	if request.SourceAssetID != nil && *request.SourceAssetID < 1 {
		return fmt.Errorf("%w: source_asset_id is invalid", ErrInvalidInput)
	}
	if hasInvalidID(request.ReferenceAssetIDs) {
		return fmt.Errorf("%w: reference_asset_ids are invalid", ErrInvalidInput)
	}
	if hasInvalidID(request.CharacterLibraryIDs) {
		return fmt.Errorf("%w: character_library_ids are invalid", ErrInvalidInput)
	}
	return nil
}

func hasInvalidID(values []int64) bool {
	for _, value := range values {
		if value < 1 {
			return true
		}
	}
	return false
}

func (r *Repository) resolveModelTarget(ctx context.Context, modelCode string) (modelTarget, error) {
	var target modelTarget
	err := r.pool.QueryRow(ctx, resolveModelTargetSQL, modelCode).Scan(
		&target.ProviderID, &target.ProviderModel, &target.ProviderType,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return target, fmt.Errorf("%w: invalid model", ErrInvalidInput)
	}
	if err != nil {
		return target, fmt.Errorf("resolve public image model: %w", err)
	}
	return target, nil
}

func validateCreateSettings(settings siteSettings, request PublicCreateJobRequest, owner Owner) error {
	if owner.UserID == nil && request.ClientProviderConfig == nil && !settings.AllowAnonymousImage {
		return fmt.Errorf("%w: anonymous image disabled", ErrForbidden)
	}
	if requiresUploads(request) && !settings.UploadsEnabled {
		return fmt.Errorf("%w: uploads disabled", ErrForbidden)
	}
	return nil
}

func requiresUploads(request PublicCreateJobRequest) bool {
	return request.Mode == "edit" || len(request.ReferenceAssetIDs) > 0 || len(request.CharacterLibraryIDs) > 0
}

func shouldConsumePublicQuota(owner Owner, clientConfig *ClientProviderConfig) bool {
	return owner.UserID == nil && clientConfig == nil
}

func jsonString(value any) (any, error) {
	content, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	if string(content) == "null" {
		return nil, nil
	}
	return string(content), nil
}
