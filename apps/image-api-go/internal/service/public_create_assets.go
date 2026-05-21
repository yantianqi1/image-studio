package service

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

type publicCreateAsset struct {
	ID                      int64
	Visibility              string
	OwnerUserID             *int64
	OwnerAnonymousSessionID *int64
}

type characterRecord struct {
	ID      int64
	AssetID int64
	Name    string
}

type characterBundle struct {
	AssetIDs []int64
	Prompt   string
}

type sourceAssetOptions struct {
	Request PublicCreateJobRequest
	Owner   Owner
}

type referenceAssetOptions struct {
	AssetIDs []int64
	Owner    Owner
}

type conversationAssetOptions struct {
	Messages []map[string]any
	Owner    Owner
}

type conversationPartOptions struct {
	Parts []any
	Owner Owner
}

type characterBundleOptions struct {
	Owner        Owner
	CharacterIDs []int64
	Prompt       string
}

type accessibleCharactersOptions struct {
	Owner Owner
	IDs   []int64
}

func (r *Repository) resolveSourceAssetID(
	ctx context.Context,
	tx pgx.Tx,
	options sourceAssetOptions,
) (*int64, error) {
	if options.Request.Mode != "edit" {
		return nil, nil
	}
	if options.Request.SourceAssetID == nil {
		return nil, fmt.Errorf("%w: source asset required for edit mode", ErrInvalidInput)
	}
	asset, err := loadPublicCreateAsset(ctx, tx, *options.Request.SourceAssetID)
	if err != nil {
		return nil, err
	}
	if !publicCreateAssetAllowed(asset, options.Owner) {
		return nil, fmt.Errorf("%w: source asset forbidden", ErrForbidden)
	}
	return &asset.ID, nil
}

func resolveReferenceAssetIDs(
	ctx context.Context,
	tx pgx.Tx,
	options referenceAssetOptions,
) ([]int64, error) {
	result := make([]int64, 0, len(options.AssetIDs))
	for _, assetID := range options.AssetIDs {
		asset, err := loadPublicCreateAsset(ctx, tx, assetID)
		if err != nil {
			return nil, err
		}
		if !publicCreateAssetAllowed(asset, options.Owner) {
			return nil, fmt.Errorf("%w: reference asset forbidden", ErrForbidden)
		}
		result = append(result, asset.ID)
	}
	return result, nil
}

func validateConversationMessageAssets(
	ctx context.Context,
	tx pgx.Tx,
	options conversationAssetOptions,
) error {
	for _, message := range options.Messages {
		parts, ok := message["content"].([]any)
		if !ok {
			continue
		}
		if err := validateConversationParts(ctx, tx, conversationPartOptions{
			Parts: parts,
			Owner: options.Owner,
		}); err != nil {
			return err
		}
	}
	return nil
}

func validateConversationParts(ctx context.Context, tx pgx.Tx, options conversationPartOptions) error {
	for _, part := range options.Parts {
		payload, ok := part.(map[string]any)
		if !ok || payload["type"] != "image_asset" {
			continue
		}
		assetID, ok := numericAssetID(payload["asset_id"])
		if !ok {
			return fmt.Errorf("%w: conversation image asset is invalid", ErrInvalidInput)
		}
		if _, err := resolveReferenceAssetIDs(ctx, tx, referenceAssetOptions{
			AssetIDs: []int64{assetID},
			Owner:    options.Owner,
		}); err != nil {
			return err
		}
	}
	return nil
}

func loadPublicCreateAsset(ctx context.Context, tx pgx.Tx, assetID int64) (publicCreateAsset, error) {
	var asset publicCreateAsset
	var userID sql.NullInt64
	var anonymousSessionID sql.NullInt64
	err := tx.QueryRow(ctx, publicCreateAssetSQL, assetID).Scan(
		&asset.ID, &asset.Visibility, &userID, &anonymousSessionID,
	)
	if err == pgx.ErrNoRows {
		return asset, ErrNotFound
	}
	if err != nil {
		return asset, fmt.Errorf("load image asset: %w", err)
	}
	asset.OwnerUserID = nullInt64Pointer(userID)
	asset.OwnerAnonymousSessionID = nullInt64Pointer(anonymousSessionID)
	return asset, nil
}

func publicCreateAssetAllowed(asset publicCreateAsset, owner Owner) bool {
	if asset.Visibility == "public" {
		return true
	}
	if owner.UserID != nil && asset.OwnerUserID != nil {
		return *asset.OwnerUserID == *owner.UserID
	}
	if owner.AnonymousSessionID != nil && asset.OwnerAnonymousSessionID != nil {
		return *asset.OwnerAnonymousSessionID == *owner.AnonymousSessionID
	}
	return false
}

func nullInt64Pointer(value sql.NullInt64) *int64 {
	if !value.Valid {
		return nil
	}
	result := value.Int64
	return &result
}

func numericAssetID(value any) (int64, bool) {
	number, ok := value.(float64)
	if !ok || number < 1 || number != float64(int64(number)) {
		return 0, false
	}
	return int64(number), true
}

func resolveCharacterBundle(
	ctx context.Context,
	tx pgx.Tx,
	options characterBundleOptions,
) (characterBundle, error) {
	ids := orderedUniqueIDs(options.CharacterIDs)
	if len(ids) == 0 {
		return characterBundle{Prompt: options.Prompt}, nil
	}
	records, err := loadAccessibleCharacters(ctx, tx, accessibleCharactersOptions{
		Owner: options.Owner,
		IDs:   ids,
	})
	if err != nil {
		return characterBundle{}, err
	}
	return buildCharacterBundle(ids, records, options.Prompt)
}

func loadAccessibleCharacters(
	ctx context.Context,
	tx pgx.Tx,
	options accessibleCharactersOptions,
) (map[int64]characterRecord, error) {
	rows, err := queryAccessibleCharacters(ctx, tx, options)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCharacterRecords(rows)
}

func queryAccessibleCharacters(ctx context.Context, tx pgx.Tx, options accessibleCharactersOptions) (pgx.Rows, error) {
	if options.Owner.UserID != nil {
		return tx.Query(ctx, accessibleCharacterSQL, options.IDs, *options.Owner.UserID)
	}
	return tx.Query(ctx, publicCharacterSQL, options.IDs)
}

func scanCharacterRecords(rows pgx.Rows) (map[int64]characterRecord, error) {
	records := map[int64]characterRecord{}
	for rows.Next() {
		var record characterRecord
		if err := rows.Scan(&record.ID, &record.AssetID, &record.Name); err != nil {
			return nil, fmt.Errorf("scan character reference: %w", err)
		}
		records[record.ID] = record
	}
	return records, rows.Err()
}

func buildCharacterBundle(
	ids []int64,
	records map[int64]characterRecord,
	prompt string,
) (characterBundle, error) {
	assetIDs := make([]int64, 0, len(ids))
	names := make([]string, 0, len(ids))
	for _, id := range ids {
		record, ok := records[id]
		if !ok {
			return characterBundle{}, ErrNotFound
		}
		assetIDs = append(assetIDs, record.AssetID)
		names = append(names, record.Name)
	}
	return characterBundle{AssetIDs: assetIDs, Prompt: appendCharacterPrompt(prompt, names)}, nil
}

func orderedUniqueIDs(values []int64) []int64 {
	ids := []int64{}
	seen := map[int64]bool{}
	for _, value := range values {
		if value > 0 && !seen[value] {
			seen[value] = true
			ids = append(ids, value)
		}
	}
	return ids
}

func appendCharacterPrompt(prompt string, names []string) string {
	instruction := "形象库参考：" + strings.Join(names, "、") + "。\n" +
		"生成画面中的主要人物/形象必须参考随请求发送的形象库图片，保持身份识别、面部特征、发型、体型比例和整体气质一致。\n" +
		"不要照抄参考图的姿势、动作、表情、构图或背景；姿势、动作、表情和场景应按用户当前提示词重新创作。\n" +
		"如果用户提示词没有明确指定服装，保持参考图中的服装风格和关键服饰一致；如果用户明确指定服装，以用户提示词为准。"
	return strings.TrimSpace(prompt) + "\n\n" + instruction
}
