package jobs

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
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
