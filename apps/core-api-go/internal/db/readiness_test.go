package db

import (
	"context"
	"errors"
	"testing"
)

func TestCheckerRequiresDatabaseURL(t *testing.T) {
	err := Checker{}.Check(context.Background())

	if !errors.Is(err, ErrDatabaseURLMissing) {
		t.Fatalf("expected missing database url error, got %v", err)
	}
}
