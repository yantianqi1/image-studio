package jobs

import (
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/provider"
)

func scanJobContext(row pgx.Row) (*provider.JobContext, rawJobContext, error) {
	job := &provider.JobContext{}
	raw := rawJobContext{}
	var userID, anonymousID, sourceAssetID pgtype.Int4
	var clientAccessID pgtype.Text
	var requestedCount, attemptCount, maxAttempts int
	err := row.Scan(
		&job.ItemID, &job.ResultIndex, &job.ItemAvailableAt,
		&job.ID, &userID, &anonymousID, &clientAccessID,
		&job.Prompt, &job.ProviderModel, &requestedCount,
		&attemptCount, &maxAttempts, &job.StorageSubdir,
		&job.Visibility, &job.Size, &job.Quality, &sourceAssetID,
		&raw.conversationMessages, &raw.clientProviderConfig,
		&job.Provider.ID, &job.Provider.Name, &job.Provider.Type,
		&job.Provider.BaseURL, &job.Provider.APIKeyEnv,
		&job.Provider.DefaultModel, &job.Provider.Status,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, raw, provider.NewError("image_job_not_running", "image job is not running", true)
	}
	if err != nil {
		return nil, raw, err
	}
	applyScannedOptionals(job, userID, anonymousID, clientAccessID, sourceAssetID)
	job.RequestedCount = requestedCount
	job.AttemptCount = attemptCount
	job.MaxAttempts = maxAttempts
	return job, raw, nil
}

func applyScannedOptionals(
	job *provider.JobContext,
	userID pgtype.Int4,
	anonymousID pgtype.Int4,
	clientAccessID pgtype.Text,
	sourceAssetID pgtype.Int4,
) {
	if userID.Valid {
		value := int64(userID.Int32)
		job.UserID = &value
	}
	if anonymousID.Valid {
		value := int64(anonymousID.Int32)
		job.AnonymousSessionID = &value
	}
	if clientAccessID.Valid {
		value := clientAccessID.String
		job.ClientAccessID = &value
	}
	if sourceAssetID.Valid {
		job.SourceAsset = &provider.AssetRef{ID: int64(sourceAssetID.Int32)}
	}
}
