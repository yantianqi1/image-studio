package assetops

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

func VerifyAssets(ctx context.Context, request VerifyRequest) (VerifySummary, error) {
	if request.Storage == nil || request.Store == nil {
		return VerifySummary{}, fmt.Errorf("asset verify storage and store are required")
	}
	assets, err := request.Store.ListAssets(ctx, request.Limit)
	if err != nil {
		return VerifySummary{}, fmt.Errorf("list assets to verify: %w", err)
	}
	return verifyAssetRecords(request.Storage, assets)
}

func verifyAssetRecords(store readableStorage, assets []AssetRecord) (VerifySummary, error) {
	summary := VerifySummary{Checked: len(assets)}
	for _, asset := range assets {
		if !store.Exists(asset.StoragePath) {
			summary.addIssue(asset, "missing")
			summary.Missing++
			continue
		}
		content, err := store.ReadBytes(asset.StoragePath)
		if err != nil {
			return summary, fmt.Errorf("read asset %d: %w", asset.ID, err)
		}
		summary.addIntegrityIssues(asset, content)
	}
	return summary, nil
}

func (s *VerifySummary) addIntegrityIssues(asset AssetRecord, content []byte) {
	if asset.SizeBytes != nil && int64(len(content)) != *asset.SizeBytes {
		s.addIssue(asset, "size_mismatch")
		s.Mismatched++
	}
	if asset.SHA256 != nil && sha256Hex(content) != *asset.SHA256 {
		s.addIssue(asset, "hash_mismatch")
		s.Mismatched++
	}
}

func (s *VerifySummary) addIssue(asset AssetRecord, kind string) {
	s.Issues = append(s.Issues, AssetIssue{AssetID: asset.ID, Key: asset.StoragePath, Kind: kind})
}

func sha256Hex(content []byte) string {
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:])
}
