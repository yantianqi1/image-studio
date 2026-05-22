package jobs

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/provider"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
)

func TestRenderCompletionRollbackDeletesUncommittedTempFiles(t *testing.T) {
	assetStorage := &completionTestStorage{}
	state := renderCompletionState{
		request: CompleteRenderRequest{Storage: assetStorage},
		stagedResults: []stagedRenderedResult{
			{temp: storage.TempObject{Key: "staging/worker-go/a.tmp"}},
			{temp: storage.TempObject{Key: "staging/worker-go/b.tmp"}},
		},
	}

	state.rollback(context.Background(), &rollbackTestTx{})

	if assetStorage.deletedCount != 2 {
		t.Fatalf("deleted %d temp files, want 2", assetStorage.deletedCount)
	}
}

func TestCommitStagedFilesReturnsFailedAssetID(t *testing.T) {
	wantErr := errors.New("rename failed")
	assetStorage := &completionTestStorage{commitErr: wantErr}
	state := renderCompletionState{
		request: CompleteRenderRequest{Storage: assetStorage},
		stagedResults: []stagedRenderedResult{
			{assetID: 41, temp: storage.TempObject{Key: "staging/worker-go/a.tmp"}, finalKey: "asset-41.png"},
		},
	}

	assetID, err := state.commitStagedFiles()

	if !errors.Is(err, wantErr) {
		t.Fatalf("error = %v, want wrapped rename failure", err)
	}
	if assetID != 41 {
		t.Fatalf("failed asset id = %d, want 41", assetID)
	}
	if state.filesCommitted {
		t.Fatal("filesCommitted was set after commit failure")
	}
}

func TestRenderedAssetMetadataIncludesHashSizeAndBackend(t *testing.T) {
	rendered := renderedPNG()
	metadata, err := buildRenderedAssetMetadata(rendered, &backendNamedStorage{backend: storage.BackendGCS})

	if err != nil {
		t.Fatalf("build metadata failed: %v", err)
	}
	if metadata.SizeBytes != int64(len(rendered.Content)) {
		t.Fatalf("size bytes = %d, want %d", metadata.SizeBytes, len(rendered.Content))
	}
	if len(metadata.SHA256) != 64 || strings.Contains(metadata.SHA256, " ") {
		t.Fatalf("invalid sha256 %q", metadata.SHA256)
	}
	if metadata.Width == nil || *metadata.Width != 1 {
		t.Fatalf("width = %v, want 1", metadata.Width)
	}
	if metadata.Height == nil || *metadata.Height != 1 {
		t.Fatalf("height = %v, want 1", metadata.Height)
	}
	if metadata.StorageBackend != storage.BackendGCS {
		t.Fatalf("backend = %q, want gcs", metadata.StorageBackend)
	}
}

type completionTestStorage struct {
	commitErr    error
	deletedCount int
}

func (s *completionTestStorage) WriteBytes(string, []byte, string) error { return nil }

func (s *completionTestStorage) WriteTemp([]byte, string) (storage.TempObject, error) {
	return storage.TempObject{}, nil
}

func (s *completionTestStorage) CommitTemp(storage.TempObject, string) error {
	return s.commitErr
}

func (s *completionTestStorage) ReadBytes(string) ([]byte, error) { return nil, nil }

func (s *completionTestStorage) Exists(string) bool { return false }

func (s *completionTestStorage) Delete(string) error {
	s.deletedCount++
	return nil
}

type backendNamedStorage struct {
	completionTestStorage
	backend string
}

func (s backendNamedStorage) Backend() string { return s.backend }

func renderedPNG() *provider.RenderedImage {
	return &provider.RenderedImage{Content: []byte{
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
		0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
		0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
		0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
		0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d,
		0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
		0x44, 0xae, 0x42, 0x60, 0x82,
	}, MimeType: "image/png"}
}

type rollbackTestTx struct{}

func (t *rollbackTestTx) Begin(context.Context) (pgx.Tx, error) { return nil, nil }

func (t *rollbackTestTx) Commit(context.Context) error { return nil }

func (t *rollbackTestTx) Rollback(context.Context) error { return nil }

func (t *rollbackTestTx) CopyFrom(
	context.Context,
	pgx.Identifier,
	[]string,
	pgx.CopyFromSource,
) (int64, error) {
	return 0, nil
}

func (t *rollbackTestTx) SendBatch(context.Context, *pgx.Batch) pgx.BatchResults { return nil }

func (t *rollbackTestTx) LargeObjects() pgx.LargeObjects { return pgx.LargeObjects{} }

func (t *rollbackTestTx) Prepare(context.Context, string, string) (*pgconn.StatementDescription, error) {
	return nil, nil
}

func (t *rollbackTestTx) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}

func (t *rollbackTestTx) Query(context.Context, string, ...any) (pgx.Rows, error) { return nil, nil }

func (t *rollbackTestTx) QueryRow(context.Context, string, ...any) pgx.Row { return nil }

func (t *rollbackTestTx) Conn() *pgx.Conn { return nil }
