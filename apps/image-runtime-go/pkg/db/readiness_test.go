package db

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestCheckTablesReportsUnavailableTable(t *testing.T) {
	execer := &recordingExecer{failOn: "assets"}

	err := CheckTables(context.Background(), execer, []string{"image_jobs", "assets"})

	if err == nil {
		t.Fatal("expected readiness failure")
	}
	if !strings.Contains(err.Error(), "assets") {
		t.Fatalf("error %q did not include failing table", err.Error())
	}
	if len(execer.queries) != 2 {
		t.Fatalf("executed %d queries, want 2", len(execer.queries))
	}
}

func TestCheckTablesUsesLimitZeroProbe(t *testing.T) {
	execer := &recordingExecer{}

	if err := CheckTables(context.Background(), execer, RequiredImageJobTables); err != nil {
		t.Fatalf("check tables failed: %v", err)
	}
	for _, query := range execer.queries {
		if !strings.Contains(query, "SELECT 1 FROM ") || !strings.Contains(query, " LIMIT 0") {
			t.Fatalf("unexpected table probe query %q", query)
		}
	}
}

func TestRequiredImageJobTablesIncludesEventTables(t *testing.T) {
	required := strings.Join(RequiredImageJobTables, ",")
	for _, table := range []string{"image_job_events", "image_provider_usage_events", "outbox_events"} {
		if !strings.Contains(required, table) {
			t.Fatalf("required image job tables missing %s: %v", table, RequiredImageJobTables)
		}
	}
}

type recordingExecer struct {
	failOn  string
	queries []string
}

func (e *recordingExecer) Exec(_ context.Context, query string, _ ...any) (pgconn.CommandTag, error) {
	e.queries = append(e.queries, query)
	if e.failOn != "" && strings.Contains(query, e.failOn) {
		return pgconn.CommandTag{}, errors.New("table unavailable")
	}
	return pgconn.CommandTag{}, nil
}
