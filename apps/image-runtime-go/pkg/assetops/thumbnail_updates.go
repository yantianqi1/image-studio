package assetops

import "context"

type thumbnailUpdate struct {
	rebuilt bool
	updated bool
}

func updateThumbnailPath(
	ctx context.Context,
	store ThumbnailMetadataStore,
	asset AssetRecord,
	key string,
	rebuilt bool,
) (thumbnailUpdate, error) {
	if asset.ThumbnailStoragePath != nil && *asset.ThumbnailStoragePath == key {
		return thumbnailUpdate{rebuilt: rebuilt}, nil
	}
	if err := store.UpdateThumbnailStoragePath(ctx, asset.ID, key); err != nil {
		return thumbnailUpdate{}, err
	}
	return thumbnailUpdate{rebuilt: rebuilt, updated: true}, nil
}

func (s *ThumbnailRebuildSummary) addThumbnailResult(update thumbnailUpdate) {
	if update.rebuilt {
		s.Rebuilt++
	}
	if update.updated {
		s.Updated++
	}
	if !update.rebuilt && !update.updated {
		s.Skipped++
	}
}
