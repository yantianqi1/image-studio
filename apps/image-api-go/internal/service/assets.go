package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"path"
	"strings"

	"github.com/jackc/pgx/v5"
)

const (
	svgMimeType           = "image/svg+xml"
	thumbnailMimeType     = "image/jpeg"
	thumbnailMaxDimension = 640
	thumbnailSuffix       = ".thumb.jpg"
	jpegThumbnailQuality  = 82
)

type assetRecord struct {
	ID          int64
	StoragePath string
	MimeType    string
}

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
	if asset.MimeType == svgMimeType {
		return r.GetPublicAsset(ctx, assetID, owner)
	}
	key := thumbnailAssetKey(asset.StoragePath)
	if !r.storage.Exists(key) {
		if err := r.writeThumbnail(asset, key); err != nil {
			return nil, err
		}
	}
	content, err := r.storage.ReadBytes(key)
	if err != nil {
		return nil, fmt.Errorf("read public asset thumbnail: %w", err)
	}
	return &AssetContent{Content: content, MimeType: thumbnailMimeType}, nil
}

func (r *Repository) loadPublicAsset(ctx context.Context, assetID int64, owner Owner) (assetRecord, error) {
	var asset assetRecord
	err := r.pool.QueryRow(ctx, publicAssetSQL(owner), publicAssetArgs(assetID, owner)...).Scan(
		&asset.ID, &asset.StoragePath, &asset.MimeType,
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

func (r *Repository) writeThumbnail(asset assetRecord, key string) error {
	if !strings.HasPrefix(asset.MimeType, "image/") {
		return ErrUnsupported
	}
	content, err := r.storage.ReadBytes(asset.StoragePath)
	if err != nil {
		return fmt.Errorf("read thumbnail source: %w", err)
	}
	thumbnail, err := buildThumbnailBytes(content)
	if err != nil {
		return err
	}
	return r.storage.WriteBytes(key, thumbnail, thumbnailMimeType)
}

func thumbnailAssetKey(assetKey string) string {
	base := path.Base(assetKey)
	stem := strings.TrimSuffix(base, path.Ext(base))
	return path.Join(path.Dir(assetKey), stem+thumbnailSuffix)
}

func buildThumbnailBytes(content []byte) ([]byte, error) {
	source, _, err := image.Decode(bytes.NewReader(content))
	if err != nil {
		return nil, fmt.Errorf("%w: decode thumbnail source: %v", ErrUnsupported, err)
	}
	thumb := resizeNearest(source, thumbnailDimensions(source.Bounds()))
	var output bytes.Buffer
	if err := jpeg.Encode(&output, thumb, &jpeg.Options{Quality: jpegThumbnailQuality}); err != nil {
		return nil, fmt.Errorf("encode thumbnail: %w", err)
	}
	return output.Bytes(), nil
}

func thumbnailDimensions(bounds image.Rectangle) image.Rectangle {
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= thumbnailMaxDimension && height <= thumbnailMaxDimension {
		return image.Rect(0, 0, width, height)
	}
	if width >= height {
		scaledHeight := height * thumbnailMaxDimension / width
		return image.Rect(0, 0, thumbnailMaxDimension, max(scaledHeight, 1))
	}
	scaledWidth := width * thumbnailMaxDimension / height
	return image.Rect(0, 0, max(scaledWidth, 1), thumbnailMaxDimension)
}

func resizeNearest(source image.Image, target image.Rectangle) *image.RGBA {
	output := image.NewRGBA(target)
	sourceBounds := source.Bounds()
	for y := 0; y < target.Dy(); y++ {
		for x := 0; x < target.Dx(); x++ {
			sourceX := sourceBounds.Min.X + x*sourceBounds.Dx()/target.Dx()
			sourceY := sourceBounds.Min.Y + y*sourceBounds.Dy()/target.Dy()
			output.Set(x, y, source.At(sourceX, sourceY))
		}
	}
	return output
}
