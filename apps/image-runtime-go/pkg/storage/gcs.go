package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"

	cloudstorage "cloud.google.com/go/storage"
	"google.golang.org/api/iterator"
)

type GCSAssetStorage struct {
	bucketName string
	prefix     string
	client     *cloudstorage.Client
}

func NewGCSAssetStorage(bucketName string, prefix string) *GCSAssetStorage {
	return &GCSAssetStorage{bucketName: strings.TrimSpace(bucketName), prefix: normalizeGCSPrefix(prefix)}
}

func NewGCSAssetStorageWithDefaultClient(bucketName string, prefix string) (*GCSAssetStorage, error) {
	store := NewGCSAssetStorage(bucketName, prefix)
	if strings.TrimSpace(store.bucketName) == "" {
		return nil, fmt.Errorf("asset storage gcs bucket is required")
	}
	client, err := cloudstorage.NewClient(context.Background())
	if err != nil {
		return nil, fmt.Errorf("create gcs storage client: %w", err)
	}
	store.client = client
	return store, nil
}

func (s *GCSAssetStorage) WriteBytes(key string, content []byte, mimeType string) error {
	ctx := context.Background()
	object, err := s.object(key)
	if err != nil {
		return err
	}
	writer := object.NewWriter(ctx)
	writer.ContentType = mimeType
	if _, err := writer.Write(content); err != nil {
		_ = writer.Close()
		return fmt.Errorf("write gcs asset bytes: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("close gcs asset writer: %w", err)
	}
	return nil
}

func (s *GCSAssetStorage) WriteTemp(content []byte, mimeType string) (TempObject, error) {
	key, err := newTempKey()
	if err != nil {
		return TempObject{}, err
	}
	if err := s.WriteBytes(key, content, mimeType); err != nil {
		return TempObject{}, err
	}
	return TempObject{Key: key, MimeType: mimeType}, nil
}

func (s *GCSAssetStorage) CommitTemp(temp TempObject, finalKey string) error {
	if err := validateTempKey(temp.Key); err != nil {
		return err
	}
	if s.Exists(finalKey) {
		return fmt.Errorf("committed asset already exists: %s", finalKey)
	}
	ctx := context.Background()
	finalObject, err := s.object(finalKey)
	if err != nil {
		return err
	}
	tempObject, err := s.object(temp.Key)
	if err != nil {
		return err
	}
	if _, err := finalObject.CopierFrom(tempObject).Run(ctx); err != nil {
		return fmt.Errorf("commit gcs temp asset: %w", err)
	}
	return s.Delete(temp.Key)
}

func (s *GCSAssetStorage) ReadBytes(key string) ([]byte, error) {
	object, err := s.object(key)
	if err != nil {
		return nil, err
	}
	reader, err := object.NewReader(context.Background())
	if err != nil {
		return nil, fmt.Errorf("read gcs asset bytes: %w", err)
	}
	defer reader.Close()
	content, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("read gcs asset body: %w", err)
	}
	return content, nil
}

func (s *GCSAssetStorage) Exists(key string) bool {
	object, err := s.object(key)
	if err != nil {
		return false
	}
	_, err = object.Attrs(context.Background())
	return err == nil
}

func (s *GCSAssetStorage) Delete(key string) error {
	object, err := s.object(key)
	if err != nil {
		return err
	}
	err = object.Delete(context.Background())
	if errors.Is(err, cloudstorage.ErrObjectNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("delete gcs asset bytes: %w", err)
	}
	return nil
}

func (s *GCSAssetStorage) ListGeneratedAssetKeys() ([]string, error) {
	keys := []string{}
	bucket, err := s.bucket()
	if err != nil {
		return nil, err
	}
	objectIterator := bucket.Objects(context.Background(), &cloudstorage.Query{Prefix: s.prefixedQueryPrefix()})
	for {
		attrs, err := objectIterator.Next()
		if errors.Is(err, iterator.Done) {
			return keys, nil
		}
		if err != nil {
			return nil, fmt.Errorf("list gcs generated assets: %w", err)
		}
		if key, ok := s.relativeGeneratedAssetKey(attrs.Name); ok {
			keys = append(keys, key)
		}
	}
}

func (s *GCSAssetStorage) ObjectKey(key string) (string, error) {
	if strings.TrimSpace(s.bucketName) == "" {
		return "", fmt.Errorf("asset storage gcs bucket is required")
	}
	if err := ValidateKey(key); err != nil {
		return "", err
	}
	if s.prefix == "" {
		return key, nil
	}
	if err := ValidateKey(s.prefix); err != nil {
		return "", err
	}
	return path.Join(s.prefix, key), nil
}

func (s *GCSAssetStorage) object(key string) (*cloudstorage.ObjectHandle, error) {
	objectKey, err := s.ObjectKey(key)
	if err != nil {
		return nil, err
	}
	bucket, err := s.bucket()
	if err != nil {
		return nil, err
	}
	return bucket.Object(objectKey), nil
}

func (s *GCSAssetStorage) bucket() (*cloudstorage.BucketHandle, error) {
	if s.client == nil {
		return nil, fmt.Errorf("asset storage gcs client is required")
	}
	return s.client.Bucket(s.bucketName), nil
}

func (s *GCSAssetStorage) prefixedQueryPrefix() string {
	if s.prefix == "" {
		return ""
	}
	return s.prefix + "/"
}

func (s *GCSAssetStorage) relativeGeneratedAssetKey(objectName string) (string, bool) {
	key := strings.TrimPrefix(objectName, s.prefixedQueryPrefix())
	if key == objectName && s.prefix != "" {
		return "", false
	}
	return key, !isExcludedAssetDir(key) && isGeneratedAssetKey(key)
}

func normalizeGCSPrefix(prefix string) string {
	normalized := strings.Trim(strings.TrimSpace(prefix), "/")
	return normalized
}
