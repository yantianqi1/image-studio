package jobs

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"strings"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/provider"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
)

const svgMimeType = "image/svg+xml"

type renderedAssetMetadata struct {
	SizeBytes      int64
	SHA256         string
	Width          *int
	Height         *int
	StorageBackend string
}

func buildRenderedAssetMetadata(
	rendered *provider.RenderedImage,
	store storage.AssetStorage,
) (renderedAssetMetadata, error) {
	if rendered == nil || len(rendered.Content) == 0 {
		return renderedAssetMetadata{}, provider.NewError("provider_response_invalid", "rendered image content empty", false)
	}
	width, height, err := decodedDimensions(rendered)
	if err != nil {
		return renderedAssetMetadata{}, err
	}
	sum := sha256.Sum256(rendered.Content)
	return renderedAssetMetadata{
		SizeBytes:      int64(len(rendered.Content)),
		SHA256:         hex.EncodeToString(sum[:]),
		Width:          width,
		Height:         height,
		StorageBackend: storage.BackendName(store),
	}, nil
}

func decodedDimensions(rendered *provider.RenderedImage) (*int, *int, error) {
	if !supportsDimensionDecode(rendered.MimeType) {
		return nil, nil, nil
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(rendered.Content))
	if err != nil {
		return nil, nil, fmt.Errorf("decode rendered image dimensions: %w", err)
	}
	return &config.Width, &config.Height, nil
}

func supportsDimensionDecode(mimeType string) bool {
	switch strings.ToLower(strings.TrimSpace(mimeType)) {
	case "image/png", "image/jpeg", "image/gif":
		return true
	case svgMimeType:
		return false
	default:
		return false
	}
}
