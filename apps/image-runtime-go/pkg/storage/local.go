package storage

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io/fs"
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
	stagingPrefix             = "staging/worker-go"
)

type Config struct {
	Backend            string
	GeneratedAssetsDir string
}

type AssetStorage interface {
	WriteBytes(key string, content []byte, mimeType string) error
	WriteTemp(content []byte, mimeType string) (TempObject, error)
	CommitTemp(temp TempObject, finalKey string) error
	ReadBytes(key string) ([]byte, error)
	Exists(key string) bool
	Delete(key string) error
}

type GeneratedAssetLister interface {
	ListGeneratedAssetKeys() ([]string, error)
}

type TempObject struct {
	Key      string
	MimeType string
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

func (s *LocalAssetStorage) WriteTemp(content []byte, mimeType string) (TempObject, error) {
	key, err := newTempKey()
	if err != nil {
		return TempObject{}, err
	}
	if err := s.WriteBytes(key, content, mimeType); err != nil {
		return TempObject{}, err
	}
	return TempObject{Key: key, MimeType: mimeType}, nil
}

func (s *LocalAssetStorage) CommitTemp(temp TempObject, finalKey string) error {
	if err := validateTempKey(temp.Key); err != nil {
		return err
	}
	source, err := s.resolvePath(temp.Key)
	if err != nil {
		return err
	}
	target, err := s.resolvePath(finalKey)
	if err != nil {
		return err
	}
	return moveTempFile(source, target)
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

func (s *LocalAssetStorage) ListGeneratedAssetKeys() ([]string, error) {
	keys := []string{}
	err := filepath.WalkDir(s.root, func(filePath string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		key, err := s.keyFromPath(filePath)
		if err != nil || key == "." {
			return err
		}
		if entry.IsDir() && isExcludedAssetDir(key) {
			return filepath.SkipDir
		}
		if !entry.IsDir() && isGeneratedAssetKey(key) {
			keys = append(keys, key)
		}
		return nil
	})
	return keys, err
}

func (s *LocalAssetStorage) resolvePath(key string) (string, error) {
	if err := ValidateKey(key); err != nil {
		return "", err
	}
	return filepath.Join(s.root, filepath.FromSlash(key)), nil
}

func (s *LocalAssetStorage) keyFromPath(filePath string) (string, error) {
	rel, err := filepath.Rel(s.root, filePath)
	if err != nil {
		return "", err
	}
	return filepath.ToSlash(rel), nil
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

func newTempKey() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate temp asset key: %w", err)
	}
	return path.Join(stagingPrefix, hex.EncodeToString(raw)+".tmp"), nil
}

func validateTempKey(key string) error {
	if err := ValidateKey(key); err != nil {
		return err
	}
	if !strings.HasPrefix(path.Clean(key), stagingPrefix+"/") {
		return fmt.Errorf("temp asset key must be under %s", stagingPrefix)
	}
	return nil
}

func moveTempFile(source string, target string) error {
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return fmt.Errorf("create committed asset directory: %w", err)
	}
	if _, err := os.Stat(target); err == nil {
		return fmt.Errorf("committed asset already exists: %s", target)
	}
	if err := os.Rename(source, target); err != nil {
		return fmt.Errorf("commit temp asset: %w", err)
	}
	return nil
}

func isExcludedAssetDir(key string) bool {
	switch strings.Split(key, "/")[0] {
	case "uploads", "comics", "staging":
		return true
	default:
		return false
	}
}

func isGeneratedAssetKey(key string) bool {
	if !strings.HasPrefix(path.Base(key), "asset-") {
		return false
	}
	switch strings.ToLower(path.Ext(key)) {
	case ".png", ".jpg", ".jpeg", ".webp", ".svg", ".bin":
		return true
	default:
		return false
	}
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
