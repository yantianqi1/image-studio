package assetops

import "context"

type AssetRecord struct {
	ID                   int64
	StoragePath          string
	MimeType             string
	SizeBytes            *int64
	SHA256               *string
	ThumbnailStoragePath *string
}

type ReferencedKeyStore interface {
	ListReferencedAssetKeys(context.Context) (map[string]struct{}, error)
}

type AssetStore interface {
	ListAssets(context.Context, int) ([]AssetRecord, error)
}

type ThumbnailMetadataStore interface {
	ListThumbnailCandidates(context.Context) ([]AssetRecord, error)
	UpdateThumbnailStoragePath(context.Context, int64, string) error
}

type GeneratedAssetStorage interface {
	ListGeneratedAssetKeys() ([]string, error)
	Delete(string) error
}

type OrphanScanRequest struct {
	Storage GeneratedAssetStorage
	Store   ReferencedKeyStore
	Execute bool
}

type OrphanScanSummary struct {
	Scanned    int
	Referenced int
	Orphaned   int
	Deleted    int
}

type VerifyRequest struct {
	Storage readableStorage
	Store   AssetStore
	Limit   int
}

type VerifySummary struct {
	Checked    int
	Missing    int
	Mismatched int
	Issues     []AssetIssue
}

type AssetIssue struct {
	AssetID int64
	Key     string
	Kind    string
}

type ThumbnailRebuildRequest struct {
	Storage     thumbnailStorage
	Store       ThumbnailMetadataStore
	MissingOnly bool
}

type ThumbnailRebuildSummary struct {
	Checked int
	Skipped int
	Rebuilt int
	Updated int
}

type readableStorage interface {
	ReadBytes(string) ([]byte, error)
	Exists(string) bool
}

type writableStorage interface {
	WriteBytes(string, []byte, string) error
}

type thumbnailStorage interface {
	readableStorage
	writableStorage
}
