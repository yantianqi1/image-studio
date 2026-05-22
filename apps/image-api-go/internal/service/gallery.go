package service

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

const (
	galleryScopeMine   = "mine"
	galleryScopePublic = "public"
)

type galleryItemDBRow struct {
	AssetID       int64
	AssetURL      string
	ThumbnailURL  string
	Visibility    string
	PublishedAt   sql.NullTime
	CreatedAt     sql.NullTime
	JobID         int64
	ResultIndex   int
	Prompt        string
	RevisedPrompt sql.NullString
}

func (r *Repository) GetPublicGallery(
	ctx context.Context,
	owner Owner,
	scope string,
) ([]GalleryItemPayload, error) {
	normalized, err := normalizeGalleryScope(scope)
	if err != nil {
		return nil, err
	}
	if normalized == galleryScopeMine && owner.UserID == nil && owner.AnonymousSessionID == nil {
		return []GalleryItemPayload{}, nil
	}
	rows, err := r.pool.Query(ctx, publicGallerySQL(normalized, owner), publicGalleryArgs(normalized, owner)...)
	if err != nil {
		return nil, fmt.Errorf("query public image gallery: %w", err)
	}
	defer rows.Close()
	return scanGalleryItems(rows)
}

func normalizeGalleryScope(scope string) (string, error) {
	normalized := strings.TrimSpace(scope)
	if normalized == "" {
		normalized = galleryScopeMine
	}
	if normalized == galleryScopeMine || normalized == galleryScopePublic {
		return normalized, nil
	}
	return "", fmt.Errorf("%w: image gallery scope invalid", ErrInvalidInput)
}

func publicGallerySQL(scope string, owner Owner) string {
	base := publicGalleryBaseSQL
	if scope == galleryScopePublic {
		return base + publicGalleryWherePublicSQL
	}
	if owner.UserID != nil {
		return base + publicGalleryWhereUserSQL
	}
	return base + publicGalleryWhereAnonymousSQL
}

func publicGalleryArgs(scope string, owner Owner) []any {
	if scope == galleryScopePublic {
		return []any{}
	}
	if owner.UserID != nil {
		return []any{*owner.UserID}
	}
	if owner.AnonymousSessionID != nil {
		return []any{*owner.AnonymousSessionID}
	}
	return []any{}
}

func scanGalleryItems(rows pgx.Rows) ([]GalleryItemPayload, error) {
	items := []GalleryItemPayload{}
	for rows.Next() {
		item, err := scanGalleryItem(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func scanGalleryItem(rows pgx.Rows) (GalleryItemPayload, error) {
	var row galleryItemDBRow
	err := rows.Scan(
		&row.AssetID, &row.AssetURL, &row.ThumbnailURL, &row.Visibility,
		&row.PublishedAt, &row.CreatedAt, &row.JobID, &row.ResultIndex,
		&row.Prompt, &row.RevisedPrompt,
	)
	if err != nil {
		return GalleryItemPayload{}, fmt.Errorf("scan public image gallery item: %w", err)
	}
	return galleryItemPayloadFromDBRow(row), nil
}

func galleryItemPayloadFromDBRow(row galleryItemDBRow) GalleryItemPayload {
	return GalleryItemPayload{
		AssetID: row.AssetID, AssetURL: row.AssetURL, ThumbnailURL: row.ThumbnailURL,
		Visibility: row.Visibility, PublishedAt: nullTime(row.PublishedAt),
		CreatedAt: nullTimeValue(row.CreatedAt), JobID: row.JobID, ResultIndex: row.ResultIndex,
		Prompt: row.Prompt, RevisedPrompt: nullStringValue(row.RevisedPrompt),
	}
}

func nullTimeValue(value sql.NullTime) string {
	if !value.Valid {
		return ""
	}
	return formatTime(value.Time)
}
