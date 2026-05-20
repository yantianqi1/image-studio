package storage

import (
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"
)

const (
	BackendLocal              = "local"
	BackendGCS                = "gcs"
	defaultGeneratedAssetsDir = "./generated-assets"
	defaultRenderedSuffix     = ".bin"
)

type Config struct {
	Backend            string
	GeneratedAssetsDir string
}

type AssetStorage interface {
	WriteBytes(key string, content []byte, mimeType string) error
	ReadBytes(key string) ([]byte, error)
	Exists(key string) bool
	Delete(key string) error
}

type LocalAssetStorage struct {
	root string
}

func BuildAssetStorage(cfg Config) (AssetStorage, error) {
	backend := normalizeDefault(cfg.Backend, BackendLocal)
	switch strings.ToLower(backend) {
	case BackendLocal:
		return NewLocalAssetStorage(normalizeDefault(cfg.GeneratedAssetsDir, defaultGeneratedAssetsDir)), nil
	case BackendGCS:
		return nil, fmt.Errorf("asset storage backend gcs is unsupported by go worker render mode")
	default:
		return nil, fmt.Errorf("unsupported asset storage backend %q", cfg.Backend)
	}
}

func NewLocalAssetStorage(root string) *LocalAssetStorage {
	return &LocalAssetStorage{root: root}
}

func (s *LocalAssetStorage) WriteBytes(key string, content []byte, mimeType string) error {
	_ = mimeType
	target, err := s.resolvePath(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return fmt.Errorf("create asset directory: %w", err)
	}
	if err := os.WriteFile(target, content, 0o644); err != nil {
		return fmt.Errorf("write asset bytes: %w", err)
	}
	return nil
}

func (s *LocalAssetStorage) ReadBytes(key string) ([]byte, error) {
	target, err := s.resolvePath(key)
	if err != nil {
		return nil, err
	}
	content, err := os.ReadFile(target)
	if err != nil {
		return nil, fmt.Errorf("read asset bytes: %w", err)
	}
	return content, nil
}

func (s *LocalAssetStorage) Exists(key string) bool {
	target, err := s.resolvePath(key)
	if err != nil {
		return false
	}
	info, err := os.Stat(target)
	return err == nil && !info.IsDir()
}

func (s *LocalAssetStorage) Delete(key string) error {
	target, err := s.resolvePath(key)
	if err != nil {
		return err
	}
	if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("delete asset bytes: %w", err)
	}
	return nil
}

func (s *LocalAssetStorage) resolvePath(key string) (string, error) {
	if err := ValidateKey(key); err != nil {
		return "", err
	}
	return filepath.Join(s.root, filepath.FromSlash(key)), nil
}

func RenderedAssetKey(assetID int64, mimeType string, storageSubdir string) (string, error) {
	filename := fmt.Sprintf("asset-%d%s", assetID, renderedSuffix(mimeType))
	key := filename
	if strings.TrimSpace(storageSubdir) != "" {
		key = path.Join(storageSubdir, filename)
	}
	if err := ValidateKey(key); err != nil {
		return "", err
	}
	return key, nil
}

func ValidateKey(key string) error {
	cleaned := path.Clean(key)
	if key == "" || strings.HasPrefix(key, "/") || cleaned == "." || strings.HasPrefix(cleaned, "../") {
		return fmt.Errorf("asset storage key must be relative")
	}
	if cleaned == ".." || strings.Contains(cleaned, "/../") {
		return fmt.Errorf("asset storage key must not traverse directories")
	}
	return nil
}

func renderedSuffix(mimeType string) string {
	switch strings.ToLower(strings.TrimSpace(mimeType)) {
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/svg+xml":
		return ".svg"
	default:
		return defaultRenderedSuffix
	}
}

func normalizeDefault(value string, fallback string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fallback
	}
	return trimmed
}
