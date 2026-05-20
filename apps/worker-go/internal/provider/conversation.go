package provider

func CollectConversationAssetIDs(messages []map[string]any) []int64 {
	ids := []int64{}
	for _, message := range messages {
		content, ok := message["content"].([]any)
		if !ok {
			continue
		}
		ids = append(ids, collectContentAssetIDs(content)...)
	}
	return ids
}

func collectContentAssetIDs(content []any) []int64 {
	ids := []int64{}
	for _, item := range content {
		part, ok := item.(map[string]any)
		if !ok || part["type"] != "image_asset" {
			continue
		}
		if id, ok := numberToInt64(part["asset_id"]); ok {
			ids = append(ids, id)
		}
	}
	return ids
}

func numberToInt64(value any) (int64, bool) {
	switch typed := value.(type) {
	case int:
		return int64(typed), true
	case int64:
		return typed, true
	case float64:
		if typed == float64(int64(typed)) {
			return int64(typed), true
		}
	}
	return 0, false
}
