package provider

import (
	"encoding/base64"
	"fmt"

	"github.com/yantianqi1/image-studio/apps/worker-go/internal/storage"
)

func buildChatMessages(job JobContext, store storage.AssetStorage) ([]map[string]any, error) {
	prompt := buildChatImagePrompt(job.Prompt, job.Size, job.Quality)
	assets := renderAssets(job)
	if len(assets) == 0 {
		if len(job.ConversationMessages) == 0 {
			return []map[string]any{{"role": "user", "content": prompt}}, nil
		}
		return buildConversationMessages(job, store, prompt)
	}
	if len(job.ConversationMessages) > 0 {
		return buildConversationMessagesWithAssets(job, store, prompt, assets)
	}
	content := []any{map[string]any{"type": "text", "text": prompt}}
	for _, asset := range assets {
		imageContent, err := buildImageContent(asset, store)
		if err != nil {
			return nil, err
		}
		content = append(content, imageContent)
	}
	return []map[string]any{{"role": "user", "content": content}}, nil
}

func renderAssets(job JobContext) []AssetRef {
	assets := make([]AssetRef, 0, len(job.ReferenceAssets)+len(job.ConversationAssets)+1)
	assets = append(assets, job.ReferenceAssets...)
	if job.SourceAsset != nil {
		assets = append(assets, *job.SourceAsset)
	}
	assets = append(assets, job.ConversationAssets...)
	return uniqueAssets(assets)
}

func buildConversationMessages(job JobContext, store storage.AssetStorage, prompt string) ([]map[string]any, error) {
	assetMap := assetMapForJob(job)
	latestUser := latestUserMessageIndex(job.ConversationMessages)
	messages := make([]map[string]any, 0, len(job.ConversationMessages))
	for index, message := range job.ConversationMessages {
		content, err := buildConversationContent(message["content"], assetMap, store, promptForIndex(index, latestUser, prompt))
		if err != nil {
			return nil, err
		}
		messages = append(messages, map[string]any{"role": message["role"], "content": content})
	}
	return messages, nil
}

func buildConversationMessagesWithAssets(
	job JobContext,
	store storage.AssetStorage,
	prompt string,
	assets []AssetRef,
) ([]map[string]any, error) {
	messages, err := buildConversationMessages(job, store, prompt)
	if err != nil {
		return nil, err
	}
	extras := unreferencedAssets(assets, CollectConversationAssetIDs(job.ConversationMessages))
	return appendAssetsToLatestUserMessage(messages, extras, store)
}

func buildConversationContent(content any, assetMap map[int64]AssetRef, store storage.AssetStorage, prompt string) (any, error) {
	if text, ok := content.(string); ok {
		if prompt != "" {
			return prompt, nil
		}
		return text, nil
	}
	parts, err := buildConversationParts(content, assetMap, store, prompt)
	if err != nil {
		return nil, err
	}
	if hasImageURL(parts) {
		return parts, nil
	}
	return joinTextParts(parts), nil
}

func buildConversationParts(content any, assetMap map[int64]AssetRef, store storage.AssetStorage, prompt string) ([]any, error) {
	items, _ := content.([]any)
	parts := make([]any, 0, len(items)+1)
	replacedCurrent := false
	for _, item := range items {
		part, replaced, err := buildConversationPart(item, assetMap, store, prompt, replacedCurrent)
		if err != nil {
			return nil, err
		}
		replacedCurrent = replacedCurrent || replaced
		if part != nil {
			parts = append(parts, part)
		}
	}
	if prompt != "" && !replacedCurrent {
		parts = append([]any{map[string]any{"type": "text", "text": prompt}}, parts...)
	}
	return parts, nil
}

func buildConversationPart(
	item any,
	assetMap map[int64]AssetRef,
	store storage.AssetStorage,
	prompt string,
	replacedCurrent bool,
) (any, bool, error) {
	part, ok := item.(map[string]any)
	if !ok {
		return nil, false, nil
	}
	if part["type"] == "text" {
		text := part["text"]
		if prompt != "" && !replacedCurrent {
			text = prompt
		}
		return map[string]any{"type": "text", "text": text}, prompt != "", nil
	}
	return buildImageAssetPart(part, assetMap, store)
}

func buildImageAssetPart(part map[string]any, assetMap map[int64]AssetRef, store storage.AssetStorage) (any, bool, error) {
	if part["type"] != "image_asset" {
		return nil, false, nil
	}
	assetID, ok := numberToInt64(part["asset_id"])
	if !ok {
		return nil, false, NewError("conversation_asset_invalid", "conversation image asset id invalid", true)
	}
	asset, ok := assetMap[assetID]
	if !ok {
		return nil, false, NewError("conversation_asset_not_found", "conversation image asset not found", false)
	}
	content, err := buildImageContent(asset, store)
	return content, false, err
}

func buildImageContent(asset AssetRef, store storage.AssetStorage) (map[string]any, error) {
	content, err := store.ReadBytes(asset.StoragePath)
	if err != nil {
		return nil, WrapError("source_asset_file_missing", "source asset file missing", false, err)
	}
	encoded := base64.StdEncoding.EncodeToString(content)
	return map[string]any{
		"type": "image_url",
		"image_url": map[string]any{
			"url": fmt.Sprintf("data:%s;base64,%s", asset.MimeType, encoded),
		},
	}, nil
}

func appendAssetsToLatestUserMessage(messages []map[string]any, assets []AssetRef, store storage.AssetStorage) ([]map[string]any, error) {
	if len(assets) == 0 {
		return messages, nil
	}
	next := append([]map[string]any(nil), messages...)
	for i := len(next) - 1; i >= 0; i-- {
		if next[i]["role"] != "user" {
			continue
		}
		content, err := appendAssetsToContent(next[i]["content"], assets, store)
		if err != nil {
			return nil, err
		}
		next[i]["content"] = content
		return next, nil
	}
	return next, nil
}

func appendAssetsToContent(content any, assets []AssetRef, store storage.AssetStorage) ([]any, error) {
	parts, ok := content.([]any)
	if !ok {
		parts = []any{map[string]any{"type": "text", "text": content}}
	}
	for _, asset := range assets {
		imageContent, err := buildImageContent(asset, store)
		if err != nil {
			return nil, err
		}
		parts = append(parts, imageContent)
	}
	return parts, nil
}
