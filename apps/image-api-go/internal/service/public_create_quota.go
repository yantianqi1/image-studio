package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	publicQuotaFeatureImage = "image"
	publicQuotaDailyGlobal  = "daily_global"
	publicQuotaPerIP        = "per_ip"
	publicQuotaTimezone     = "Asia/Shanghai"
)

const upsertPublicQuotaBucketSQL = `
INSERT INTO public_quota_buckets (
  quota_mode, quota_key, used_count, limit_count, updated_at
) VALUES ($1, $2, 0, $3, $4)
ON CONFLICT (quota_mode, quota_key)
DO UPDATE SET limit_count=EXCLUDED.limit_count, updated_at=EXCLUDED.updated_at
RETURNING id`

const reservePublicQuotaSQL = `
UPDATE public_quota_buckets
SET used_count=used_count+$2, updated_at=$3
WHERE id=$1 AND used_count+$2 <= limit_count`

const insertPublicQuotaUsageSQL = `
INSERT INTO public_quota_usages (
  bucket_id, feature, units, reference_type, reference_id, request_ip_hash, created_at
) VALUES ($1, $2, $3, $4, $5, $6, $7)`

type publicQuotaConsumeOptions struct {
	Settings siteSettings
	Request  PublicCreateJobRequest
	JobID    int64
}

type publicQuotaBucketOptions struct {
	Settings      siteSettings
	RequestIPHash string
	Now           time.Time
}

type upsertQuotaBucketOptions struct {
	Mode  string
	Key   string
	Limit int
	Now   time.Time
}

type insertQuotaUsageOptions struct {
	BucketID      int64
	RequestIPHash string
	JobID         int64
	Now           time.Time
}

func (r *Repository) consumePublicQuota(
	ctx context.Context,
	tx pgx.Tx,
	options publicQuotaConsumeOptions,
) error {
	now := time.Now().UTC()
	requestIPHash := r.requestIPHash(options.Request.RequestIP)
	bucketKey, limit, err := publicQuotaBucket(publicQuotaBucketOptions{
		Settings:      options.Settings,
		RequestIPHash: requestIPHash,
		Now:           now,
	})
	if err != nil {
		return err
	}
	bucketID, err := upsertPublicQuotaBucket(ctx, tx, upsertQuotaBucketOptions{
		Mode:  options.Settings.PublicQuotaMode,
		Key:   bucketKey,
		Limit: limit,
		Now:   now,
	})
	if err != nil {
		return err
	}
	if err := reservePublicQuota(ctx, tx, bucketID, now); err != nil {
		return err
	}
	return insertPublicQuotaUsage(ctx, tx, insertQuotaUsageOptions{
		BucketID:      bucketID,
		RequestIPHash: requestIPHash,
		JobID:         options.JobID,
		Now:           now,
	})
}

func publicQuotaBucket(options publicQuotaBucketOptions) (string, int, error) {
	if options.Settings.PublicQuotaMode == publicQuotaDailyGlobal {
		key, err := dailyGlobalQuotaKey(options.Now)
		return quotaBucketResult(key, err, options.Settings.PublicQuotaDailyGlobalLimit)
	}
	if options.Settings.PublicQuotaMode == publicQuotaPerIP && options.RequestIPHash != "" {
		return validateQuotaLimit(options.RequestIPHash, options.Settings.PublicQuotaPerIPLimit)
	}
	if options.Settings.PublicQuotaMode == publicQuotaPerIP {
		return "", 0, fmt.Errorf("%w: request ip is unavailable", ErrInvalidInput)
	}
	return "", 0, fmt.Errorf("%w: public quota mode is invalid", ErrInvalidInput)
}

func quotaBucketResult(key string, err error, limit int) (string, int, error) {
	if err != nil {
		return "", 0, err
	}
	return validateQuotaLimit(key, limit)
}

func validateQuotaLimit(key string, limit int) (string, int, error) {
	if limit <= 0 {
		return "", 0, fmt.Errorf("%w: public quota limit must be positive", ErrInvalidInput)
	}
	return key, limit, nil
}

func dailyGlobalQuotaKey(now time.Time) (string, error) {
	location, err := time.LoadLocation(publicQuotaTimezone)
	if err != nil {
		return "", fmt.Errorf("load public quota timezone: %w", err)
	}
	return now.In(location).Format("2006-01-02"), nil
}

func upsertPublicQuotaBucket(
	ctx context.Context,
	tx pgx.Tx,
	options upsertQuotaBucketOptions,
) (int64, error) {
	var bucketID int64
	err := tx.QueryRow(
		ctx,
		upsertPublicQuotaBucketSQL,
		options.Mode,
		options.Key,
		options.Limit,
		options.Now,
	).Scan(&bucketID)
	if err != nil {
		return 0, fmt.Errorf("upsert public quota bucket: %w", err)
	}
	return bucketID, nil
}

func reservePublicQuota(ctx context.Context, tx pgx.Tx, bucketID int64, now time.Time) error {
	tag, err := tx.Exec(ctx, reservePublicQuotaSQL, bucketID, 1, now)
	if err != nil {
		return fmt.Errorf("reserve public quota: %w", err)
	}
	if tag.RowsAffected() != 1 {
		return fmt.Errorf("%w: public quota exhausted", ErrForbidden)
	}
	return nil
}

func insertPublicQuotaUsage(
	ctx context.Context,
	tx pgx.Tx,
	options insertQuotaUsageOptions,
) error {
	_, err := tx.Exec(
		ctx,
		insertPublicQuotaUsageSQL,
		options.BucketID,
		publicQuotaFeatureImage,
		1,
		"image_job",
		fmt.Sprint(options.JobID),
		nullString(options.RequestIPHash),
		options.Now,
	)
	if err != nil {
		return fmt.Errorf("insert public quota usage: %w", err)
	}
	return nil
}

func (r *Repository) requestIPHash(requestIP string) string {
	normalized := strings.TrimSpace(requestIP)
	if normalized == "" {
		return ""
	}
	return sha256Hex(r.config.SessionSecret + ":" + normalized)
}

func nullString(value string) any {
	if value == "" {
		return nil
	}
	return value
}
