package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
)

var RequiredImageJobTables = []string{"image_job_items", "image_jobs", "assets", "image_job_results"}

type Execer interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

func CheckTables(ctx context.Context, execer Execer, tables []string) error {
	for _, table := range tables {
		if _, err := execer.Exec(ctx, "SELECT 1 FROM "+table+" LIMIT 0"); err != nil {
			return fmt.Errorf("readiness table %s missing or unavailable: %w", table, err)
		}
	}
	return nil
}
