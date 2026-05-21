package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

const activeUserStatus = "active"

func (r *Repository) ResolveOwner(ctx context.Context, tokens OwnerTokens) (Owner, error) {
	userOwner, err := r.resolveUserOwner(ctx, tokens.UserSessionToken)
	if err != nil || userOwner.UserID != nil {
		return userOwner, err
	}
	return r.resolveAnonymousOwner(ctx, tokens.AnonymousSessionToken)
}

func (r *Repository) resolveUserOwner(ctx context.Context, token string) (Owner, error) {
	if token == "" {
		return Owner{}, nil
	}
	var id int64
	var status string
	err := r.pool.QueryRow(ctx, userOwnerSQL, sha256Hex(token)).Scan(&id, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return Owner{}, nil
	}
	if err != nil {
		return Owner{}, fmt.Errorf("resolve user session owner: %w", err)
	}
	if status != activeUserStatus {
		return Owner{}, ErrForbidden
	}
	return Owner{UserID: &id}, nil
}

func (r *Repository) resolveAnonymousOwner(ctx context.Context, token string) (Owner, error) {
	if token == "" {
		return Owner{}, nil
	}
	var id int64
	err := r.pool.QueryRow(ctx, anonymousOwnerSQL, sha256Hex(token)).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Owner{}, nil
	}
	if err != nil {
		return Owner{}, fmt.Errorf("resolve anonymous session owner: %w", err)
	}
	return Owner{AnonymousSessionID: &id}, nil
}

func sha256Hex(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
