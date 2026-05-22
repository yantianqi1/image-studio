package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/assetops"
)

type assetRecord = assetops.AssetRecord

func (r *Repository) GetPublicAsset(ctx context.Context, assetID int64, owner Owner) (*AssetContent, error) {
	asset, err := r.loadPublicAsset(ctx, assetID, owner)
	if err != nil {
		return nil, err
	}
	content, err := r.storage.ReadBytes(asset.StoragePath)
	if err != nil {
		return nil, fmt.Errorf("read public asset: %w", err)
	}
	return &AssetContent{Content: content, MimeType: asset.MimeType}, nil
}

func (r *Repository) GetPublicAssetThumbnail(ctx context.Context, assetID int64, owner Owner) (*AssetContent, error) {
	asset, err := r.loadPublicAsset(ctx, assetID, owner)
	if err != nil {
		return nil, err
	}
	if asset.MimeType == assetops.SVGMimeType {
		return r.GetPublicAsset(ctx, assetID, owner)
	}
	if !assetops.SupportsThumbnail(asset.MimeType) {
		return nil, ErrUnsupported
	}
	key, _, err := assetops.EnsureThumbnail(r.storage, asset)
	if err != nil {
		if errors.Is(err, assetops.ErrThumbnailInvalidSource) {
			return nil, fmt.Errorf("%w: %v", ErrUnsupported, err)
		}
		return nil, err
	}
	if err := r.updateThumbnailStoragePath(ctx, asset, key); err != nil {
		return nil, err
	}
	content, err := r.storage.ReadBytes(key)
	if err != nil {
		return nil, fmt.Errorf("read public asset thumbnail: %w", err)
	}
	return &AssetContent{Content: content, MimeType: assetops.ThumbnailMimeType}, nil
}

func (r *Repository) loadPublicAsset(ctx context.Context, assetID int64, owner Owner) (assetRecord, error) {
	var asset assetRecord
	err := r.pool.QueryRow(ctx, publicAssetSQL(owner), publicAssetArgs(assetID, owner)...).Scan(
		&asset.ID, &asset.StoragePath, &asset.MimeType, &asset.ThumbnailStoragePath,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return asset, ErrNotFound
	}
	if err != nil {
		return asset, fmt.Errorf("scan public asset: %w", err)
	}
	return asset, nil
}

func publicAssetArgs(assetID int64, owner Owner) []any {
	if owner.UserID != nil {
		return []any{assetID, *owner.UserID}
	}
	if owner.AnonymousSessionID != nil {
		return []any{assetID, *owner.AnonymousSessionID}
	}
	return []any{assetID}
}

func publicAssetSQL(owner Owner) string {
	if owner.UserID != nil {
		return publicAssetBaseSQL + " AND (visibility='public' OR owner_user_id=$2)"
	}
	if owner.AnonymousSessionID != nil {
		return publicAssetBaseSQL + " AND (visibility='public' OR owner_anonymous_session_id=$2)"
	}
	return publicAssetBaseSQL + " AND visibility='public'"
}

func (r *Repository) updateThumbnailStoragePath(ctx context.Context, asset assetRecord, key string) error {
	if asset.ThumbnailStoragePath != nil && *asset.ThumbnailStoragePath == key {
		return nil
	}
	if _, err := r.pool.Exec(ctx, updateAssetThumbnailPathSQL, asset.ID, key); err != nil {
		return fmt.Errorf("update public asset thumbnail path: %w", err)
	}
	return nil
}
