package provider

import (
	"fmt"
	"strings"
)

var qualityHints = map[string]string{
	"low":    "画质使用 Low 档，优先更快出图，细节可以适度简化。",
	"medium": "画质使用 Medium 档，在速度、细节和整体完成度之间保持平衡。",
	"high":   "画质使用 High 档，提升细节、纹理、光影和整体完成度。",
}

var aspectRatioHints = map[string]string{
	"1:1":  "输出为 1:1 正方形构图，主体居中，适合正方形画幅。",
	"3:2":  "输出为 3:2 横版构图，适合摄影、产品展示和横向叙事画幅。",
	"16:9": "输出为 16:9 横屏构图，适合宽画幅展示。",
	"21:9": "输出为 21:9 超宽横版构图，适合电影感全景和宽银幕画幅。",
	"9:16": "输出为 9:16 竖屏构图，适合竖版画幅展示。",
	"4:3":  "输出为 4:3 比例，兼顾宽度与高度，适合展示画面细节。",
	"3:4":  "输出为 3:4 比例，纵向构图，适合人物肖像或竖向场景。",
}

func buildChatImagePrompt(prompt string, size string, quality string) string {
	basePrompt := strings.TrimSpace(prompt)
	hints := make([]string, 0, 2)
	if sizeHint := buildSizeHint(size); sizeHint != "" {
		hints = append(hints, sizeHint)
	}
	if qualityHint := buildQualityHint(quality); qualityHint != "" {
		hints = append(hints, qualityHint)
	}
	if len(hints) == 0 {
		return basePrompt
	}
	return basePrompt + "\n\n" + strings.Join(hints, "\n")
}

func buildSizeHint(size string) string {
	normalized := strings.TrimSpace(strings.ToLower(size))
	if normalized == "" || normalized == "auto" {
		return ""
	}
	if width, height, ok := parsePixelSize(normalized); ok {
		return fmt.Sprintf("输出图片目标分辨率为 %d x %d 像素，并严格按该尺寸对应的宽高比构图。", width, height)
	}
	if hint, ok := aspectRatioHints[normalized]; ok {
		return hint
	}
	return "输出图片，目标尺寸或宽高比为 " + normalized + "。"
}

func parsePixelSize(size string) (int, int, bool) {
	parts := strings.SplitN(size, "x", 2)
	if len(parts) != 2 {
		return 0, 0, false
	}
	width, widthOK := parsePositiveInt(parts[0])
	height, heightOK := parsePositiveInt(parts[1])
	return width, height, widthOK && heightOK
}

func parsePositiveInt(value string) (int, bool) {
	var parsed int
	for _, char := range value {
		if char < '0' || char > '9' {
			return 0, false
		}
		parsed = parsed*10 + int(char-'0')
	}
	return parsed, parsed > 0
}

func buildQualityHint(quality string) string {
	return qualityHints[strings.TrimSpace(strings.ToLower(quality))]
}

func latestUserMessageIndex(messages []map[string]any) int {
	for index := len(messages) - 1; index >= 0; index-- {
		if messages[index]["role"] == "user" {
			return index
		}
	}
	return -1
}

func promptForIndex(index int, latestUser int, prompt string) string {
	if index == latestUser {
		return prompt
	}
	return ""
}

func assetMapForJob(job JobContext) map[int64]AssetRef {
	assets := renderAssets(job)
	result := make(map[int64]AssetRef, len(assets))
	for _, asset := range assets {
		result[asset.ID] = asset
	}
	return result
}

func uniqueAssets(assets []AssetRef) []AssetRef {
	seen := map[int64]bool{}
	result := make([]AssetRef, 0, len(assets))
	for _, asset := range assets {
		if seen[asset.ID] {
			continue
		}
		seen[asset.ID] = true
		result = append(result, asset)
	}
	return result
}

func unreferencedAssets(assets []AssetRef, referenced []int64) []AssetRef {
	seen := map[int64]bool{}
	for _, id := range referenced {
		seen[id] = true
	}
	result := make([]AssetRef, 0, len(assets))
	for _, asset := range assets {
		if !seen[asset.ID] {
			result = append(result, asset)
		}
	}
	return result
}

func hasImageURL(parts []any) bool {
	for _, item := range parts {
		part, ok := item.(map[string]any)
		if ok && part["type"] == "image_url" {
			return true
		}
	}
	return false
}

func joinTextParts(parts []any) string {
	texts := make([]string, 0, len(parts))
	for _, item := range parts {
		part, ok := item.(map[string]any)
		if ok && part["type"] == "text" {
			texts = append(texts, fmt.Sprint(part["text"]))
		}
	}
	return strings.Join(texts, "\n")
}
