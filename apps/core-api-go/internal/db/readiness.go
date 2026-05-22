package db

import (
	"context"
	"errors"
	"fmt"
	"strings"

	runtimedb "github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/db"
)

var ErrDatabaseURLMissing = errors.New("DATABASE_URL is required")

type Checker struct {
	DatabaseURL string
}

func (c Checker) Check(ctx context.Context) error {
	databaseURL := strings.TrimSpace(c.DatabaseURL)
	if databaseURL == "" {
		return ErrDatabaseURLMissing
	}
	pool, err := runtimedb.Connect(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("database readiness check failed: %w", err)
	}
	pool.Close()
	return nil
}
