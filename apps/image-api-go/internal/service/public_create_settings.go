package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

func ensureSiteSettings(ctx context.Context, tx pgx.Tx) (siteSettings, error) {
	settings, err := loadSiteSettings(ctx, tx)
	if errors.Is(err, pgx.ErrNoRows) {
		if _, insertErr := tx.Exec(ctx, insertDefaultSiteSettingsSQL); insertErr != nil {
			return siteSettings{}, fmt.Errorf("insert default site settings: %w", insertErr)
		}
		return loadSiteSettings(ctx, tx)
	}
	return settings, err
}

func loadSiteSettings(ctx context.Context, tx pgx.Tx) (siteSettings, error) {
	var settings siteSettings
	err := tx.QueryRow(ctx, siteSettingsSQL).Scan(
		&settings.AllowAnonymousImage,
		&settings.UploadsEnabled,
		&settings.PublicQuotaMode,
		&settings.PublicQuotaDailyGlobalLimit,
		&settings.PublicQuotaPerIPLimit,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return settings, err
	}
	if err != nil {
		return settings, fmt.Errorf("load site settings: %w", err)
	}
	return settings, nil
}
