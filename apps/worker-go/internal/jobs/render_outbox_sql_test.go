package jobs

import (
	"strings"
	"testing"
)

func TestAssetCreatedOutboxSQLCastsJsonPayloadParams(t *testing.T) {
	required := []string{
		"'asset', $1::bigint::text, 'asset.created'",
		"'storage_path', $2::text",
		"'size_bytes', $3::bigint",
		"'sha256', $4::text",
		"'width', $5::int",
		"'height', $6::int",
		"'storage_backend', $7::text",
	}
	for _, text := range required {
		if !strings.Contains(insertAssetCreatedOutboxSQL, text) {
			t.Fatalf("asset created outbox SQL missing cast %q:\n%s", text, insertAssetCreatedOutboxSQL)
		}
	}
}
