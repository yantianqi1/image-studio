package main

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
	runtimedb "github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/db"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/observability"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
	"github.com/yantianqi1/image-studio/apps/worker-go/internal/jobs"
)

type readinessDB interface {
	Ping(context.Context) error
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

func newReadyFunc(db readinessDB, assetStorage storage.AssetStorage, mode string) observability.ReadyFunc {
	return func(ctx context.Context) error {
		if err := db.Ping(ctx); err != nil {
			return err
		}
		if err := checkReadyTables(ctx, db); err != nil {
			return err
		}
		if mode == jobs.ModeRender {
			return checkStorageWritable(assetStorage)
		}
		return nil
	}
}

func checkReadyTables(ctx context.Context, db readinessDB) error {
	return runtimedb.CheckTables(ctx, db, runtimedb.RequiredImageJobTables)
}

func checkStorageWritable(assetStorage storage.AssetStorage) error {
	if assetStorage == nil {
		return fmt.Errorf("render mode asset storage is not configured")
	}
	temp, err := assetStorage.WriteTemp([]byte("ready"), "text/plain")
	if err != nil {
		return fmt.Errorf("write readiness temp asset: %w", err)
	}
	if err := assetStorage.Delete(temp.Key); err != nil {
		return fmt.Errorf("delete readiness temp asset: %w", err)
	}
	return nil
}
