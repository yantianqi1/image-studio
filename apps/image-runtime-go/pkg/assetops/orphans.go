package assetops

import (
	"context"
	"fmt"
)

func ScanOrphans(ctx context.Context, request OrphanScanRequest) (OrphanScanSummary, error) {
	if request.Storage == nil || request.Store == nil {
		return OrphanScanSummary{}, fmt.Errorf("orphan scan storage and store are required")
	}
	keys, err := request.Storage.ListGeneratedAssetKeys()
	if err != nil {
		return OrphanScanSummary{}, fmt.Errorf("list generated asset files: %w", err)
	}
	referenced, err := request.Store.ListReferencedAssetKeys(ctx)
	if err != nil {
		return OrphanScanSummary{}, fmt.Errorf("list referenced asset keys: %w", err)
	}
	return scanOrphanKeys(keys, referenced, request)
}

func scanOrphanKeys(
	keys []string,
	referenced map[string]struct{},
	request OrphanScanRequest,
) (OrphanScanSummary, error) {
	summary := OrphanScanSummary{Scanned: len(keys), Referenced: len(referenced)}
	for _, key := range keys {
		if _, ok := referenced[key]; ok {
			continue
		}
		summary.Orphaned++
		if !request.Execute {
			continue
		}
		if err := request.Storage.Delete(key); err != nil {
			return summary, fmt.Errorf("delete orphan asset %q: %w", key, err)
		}
		summary.Deleted++
	}
	return summary, nil
}
