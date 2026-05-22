package assetops

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"slices"
	"testing"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
)

type fakeAssetStore struct {
	referenced map[string]struct{}
	assets     []AssetRecord
	updated    map[int64]string
}

func (s *fakeAssetStore) ListReferencedAssetKeys(context.Context) (map[string]struct{}, error) {
	return s.referenced, nil
}

func (s *fakeAssetStore) ListAssets(context.Context, int) ([]AssetRecord, error) {
	return slices.Clone(s.assets), nil
}

func (s *fakeAssetStore) ListThumbnailCandidates(context.Context) ([]AssetRecord, error) {
	return slices.Clone(s.assets), nil
}

func (s *fakeAssetStore) UpdateThumbnailStoragePath(_ context.Context, assetID int64, key string) error {
	if s.updated == nil {
		s.updated = map[int64]string{}
	}
	s.updated[assetID] = key
	return nil
}

type memoryStorage struct {
	objects map[string][]byte
}

func newMemoryStorage(objects map[string][]byte) *memoryStorage {
	next := &memoryStorage{objects: map[string][]byte{}}
	for key, content := range objects {
		next.objects[key] = slices.Clone(content)
	}
	return next
}

func (s *memoryStorage) WriteBytes(key string, content []byte, mimeType string) error {
	_ = mimeType
	if err := storage.ValidateKey(key); err != nil {
		return err
	}
	s.objects[key] = slices.Clone(content)
	return nil
}

func (s *memoryStorage) WriteTemp(content []byte, mimeType string) (storage.TempObject, error) {
	_ = mimeType
	s.objects["staging/test.tmp"] = slices.Clone(content)
	return storage.TempObject{Key: "staging/test.tmp", MimeType: mimeType}, nil
}

func (s *memoryStorage) CommitTemp(temp storage.TempObject, finalKey string) error {
	content, ok := s.objects[temp.Key]
	if !ok {
		return fmt.Errorf("missing temp")
	}
	s.objects[finalKey] = content
	delete(s.objects, temp.Key)
	return nil
}

func (s *memoryStorage) ReadBytes(key string) ([]byte, error) {
	content, ok := s.objects[key]
	if !ok {
		return nil, fmt.Errorf("missing object %s", key)
	}
	return slices.Clone(content), nil
}

func (s *memoryStorage) Exists(key string) bool {
	_, ok := s.objects[key]
	return ok
}

func (s *memoryStorage) Delete(key string) error {
	delete(s.objects, key)
	return nil
}

func (s *memoryStorage) ListGeneratedAssetKeys() ([]string, error) {
	keys := make([]string, 0, len(s.objects))
	for key := range s.objects {
		keys = append(keys, key)
	}
	return keys, nil
}

func tinyPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	var output bytes.Buffer
	if err := png.Encode(&output, img); err != nil {
		t.Fatalf("encode png fixture: %v", err)
	}
	return output.Bytes()
}

func stringPtr(value string) *string {
	return &value
}
