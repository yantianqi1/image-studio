package assetops

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
)

const (
	SVGMimeType           = "image/svg+xml"
	ThumbnailMimeType     = "image/jpeg"
	ThumbnailMaxDimension = 640
	ThumbnailSuffix       = ".thumb.jpg"
	JPEGThumbnailQuality  = 82
)

var ErrThumbnailInvalidSource = errors.New("thumbnail source invalid")

func RebuildThumbnails(ctx context.Context, request ThumbnailRebuildRequest) (ThumbnailRebuildSummary, error) {
	if request.Storage == nil || request.Store == nil {
		return ThumbnailRebuildSummary{}, fmt.Errorf("thumbnail rebuild storage and store are required")
	}
	assets, err := request.Store.ListThumbnailCandidates(ctx)
	if err != nil {
		return ThumbnailRebuildSummary{}, fmt.Errorf("list thumbnail candidates: %w", err)
	}
	return rebuildThumbnailRecords(ctx, request, assets)
}

func EnsureThumbnail(store thumbnailStorage, asset AssetRecord) (string, bool, error) {
	if !SupportsThumbnail(asset.MimeType) {
		return "", false, fmt.Errorf("asset %d thumbnail unsupported", asset.ID)
	}
	key := ThumbnailKey(asset.StoragePath)
	if store.Exists(key) {
		return key, false, nil
	}
	if err := writeThumbnail(store, asset.StoragePath, key); err != nil {
		return "", false, err
	}
	return key, true, nil
}

func SupportsThumbnail(mimeType string) bool {
	normalized := strings.ToLower(strings.TrimSpace(mimeType))
	return strings.HasPrefix(normalized, "image/") && normalized != SVGMimeType
}

func ThumbnailKey(assetKey string) string {
	base := path.Base(assetKey)
	stem := strings.TrimSuffix(base, path.Ext(base))
	return path.Join(path.Dir(assetKey), stem+ThumbnailSuffix)
}

func rebuildThumbnailRecords(
	ctx context.Context,
	request ThumbnailRebuildRequest,
	assets []AssetRecord,
) (ThumbnailRebuildSummary, error) {
	summary := ThumbnailRebuildSummary{Checked: len(assets)}
	for _, asset := range assets {
		updated, err := rebuildOneThumbnail(ctx, request, asset)
		if err != nil {
			return summary, err
		}
		summary.addThumbnailResult(updated)
	}
	return summary, nil
}

func rebuildOneThumbnail(
	ctx context.Context,
	request ThumbnailRebuildRequest,
	asset AssetRecord,
) (thumbnailUpdate, error) {
	key := ThumbnailKey(asset.StoragePath)
	if request.MissingOnly && request.Storage.Exists(key) {
		return updateThumbnailPath(ctx, request.Store, asset, key, false)
	}
	if err := writeThumbnail(request.Storage, asset.StoragePath, key); err != nil {
		return thumbnailUpdate{}, fmt.Errorf("rebuild thumbnail for asset %d: %w", asset.ID, err)
	}
	return updateThumbnailPath(ctx, request.Store, asset, key, true)
}

func writeThumbnail(store thumbnailStorage, sourceKey string, targetKey string) error {
	content, err := store.ReadBytes(sourceKey)
	if err != nil {
		return fmt.Errorf("read thumbnail source: %w", err)
	}
	thumbnail, err := BuildThumbnailBytes(content)
	if err != nil {
		return err
	}
	return store.WriteBytes(targetKey, thumbnail, ThumbnailMimeType)
}

func BuildThumbnailBytes(content []byte) ([]byte, error) {
	source, _, err := image.Decode(bytes.NewReader(content))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrThumbnailInvalidSource, err)
	}
	thumb := resizeNearest(source, thumbnailDimensions(source.Bounds()))
	var output bytes.Buffer
	if err := jpeg.Encode(&output, thumb, &jpeg.Options{Quality: JPEGThumbnailQuality}); err != nil {
		return nil, fmt.Errorf("encode thumbnail: %w", err)
	}
	return output.Bytes(), nil
}

func thumbnailDimensions(bounds image.Rectangle) image.Rectangle {
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= ThumbnailMaxDimension && height <= ThumbnailMaxDimension {
		return image.Rect(0, 0, width, height)
	}
	if width >= height {
		scaledHeight := height * ThumbnailMaxDimension / width
		return image.Rect(0, 0, ThumbnailMaxDimension, max(scaledHeight, 1))
	}
	scaledWidth := width * ThumbnailMaxDimension / height
	return image.Rect(0, 0, max(scaledWidth, 1), ThumbnailMaxDimension)
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
