package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

const sessionTokenBytes = 32

func (r *Repository) ensureCreateOwner(
	ctx context.Context,
	tx pgx.Tx,
	tokens OwnerTokens,
) (Owner, *string, error) {
	owner, err := resolveUserOwnerInTx(ctx, tx, tokens.UserSessionToken)
	if err != nil || owner.UserID != nil {
		return owner, nil, err
	}
	owner, err = resolveAnonymousOwnerInTx(ctx, tx, tokens.AnonymousSessionToken)
	if err != nil || owner.AnonymousSessionID != nil {
		return owner, nil, err
	}
	return createAnonymousOwner(ctx, tx)
}

func resolveUserOwnerInTx(ctx context.Context, tx pgx.Tx, token string) (Owner, error) {
	if token == "" {
		return Owner{}, nil
	}
	var id int64
	var status string
	err := tx.QueryRow(ctx, userOwnerSQL, sha256Hex(token)).Scan(&id, &status)
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

func resolveAnonymousOwnerInTx(ctx context.Context, tx pgx.Tx, token string) (Owner, error) {
	if token == "" {
		return Owner{}, nil
	}
	var id int64
	err := tx.QueryRow(ctx, anonymousOwnerSQL, sha256Hex(token)).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Owner{}, nil
	}
	if err != nil {
		return Owner{}, fmt.Errorf("resolve anonymous session owner: %w", err)
	}
	return Owner{AnonymousSessionID: &id}, nil
}

func createAnonymousOwner(ctx context.Context, tx pgx.Tx) (Owner, *string, error) {
	token, err := issueSessionToken()
	if err != nil {
		return Owner{}, nil, err
	}
	var id int64
	if err := tx.QueryRow(ctx, insertAnonymousSessionSQL, sha256Hex(token)).Scan(&id); err != nil {
		return Owner{}, nil, fmt.Errorf("create anonymous session: %w", err)
	}
	return Owner{AnonymousSessionID: &id}, &token, nil
}

func issueSessionToken() (string, error) {
	content := make([]byte, sessionTokenBytes)
	if _, err := rand.Read(content); err != nil {
		return "", fmt.Errorf("issue session token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(content), nil
}
