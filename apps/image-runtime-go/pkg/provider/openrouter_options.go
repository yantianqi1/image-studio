package provider

import (
	"strconv"
	"strings"
)

var openRouterQualityImageSizes = map[string]string{
	"low":    "1K",
	"medium": "2K",
	"high":   "4K",
}

var openRouterSizeToAspectRatio = map[string]string{
	"1024x1024": "1:1",
	"1248x832":  "3:2",
	"832x1248":  "2:3",
	"1184x864":  "4:3",
	"864x1184":  "3:4",
	"1152x896":  "5:4",
	"896x1152":  "4:5",
	"1344x768":  "16:9",
	"768x1344":  "9:16",
	"1536x672":  "21:9",
}

func buildOpenRouterImageConfig(size string, quality string) (map[string]string, error) {
	config := map[string]string{}
	aspectRatio, err := resolveOpenRouterAspectRatio(size)
	if err != nil {
		return nil, err
	}
	imageSize, err := resolveOpenRouterImageSize(quality)
	if err != nil {
		return nil, err
	}
	if aspectRatio != "" {
		config["aspect_ratio"] = aspectRatio
	}
	if imageSize != "" {
		config["image_size"] = imageSize
	}
	return config, nil
}

func resolveOpenRouterAspectRatio(size string) (string, error) {
	normalized := strings.TrimSpace(strings.ToLower(size))
	if normalized == "" || normalized == "auto" {
		return "", nil
	}
	if isAspectRatio(normalized) {
		return normalized, nil
	}
	if ratio, ok := openRouterSizeToAspectRatio[normalized]; ok {
		return ratio, nil
	}
	width, height, ok := parsePixelSize(normalized)
	if !ok {
		return "", NewError("openrouter_image_size_invalid", "openrouter image size invalid", true)
	}
	divisor := gcd(width, height)
	return intString(width/divisor) + ":" + intString(height/divisor), nil
}

func resolveOpenRouterImageSize(quality string) (string, error) {
	normalized := strings.TrimSpace(strings.ToLower(quality))
	if normalized == "" {
		return "", nil
	}
	imageSize, ok := openRouterQualityImageSizes[normalized]
	if !ok {
		return "", NewError("openrouter_image_quality_invalid", "openrouter image quality invalid", true)
	}
	return imageSize, nil
}

func isAspectRatio(value string) bool {
	parts := strings.SplitN(value, ":", 2)
	return len(parts) == 2 && positiveDigits(parts[0]) && positiveDigits(parts[1])
}

func positiveDigits(value string) bool {
	_, ok := parsePositiveInt(value)
	return ok
}

func gcd(left int, right int) int {
	for right != 0 {
		left, right = right, left%right
	}
	return left
}

func intString(value int) string {
	return strconv.Itoa(value)
}
