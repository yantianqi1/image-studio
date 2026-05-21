package config

import (
	"fmt"
	"strconv"
	"strings"
)

func parsePositiveInt(lookup LookupFunc, key string, defaultValue int) (int, error) {
	raw, ok := lookup(key)
	if !ok {
		return defaultValue, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer: %w", key, err)
	}
	if value < 1 {
		return 0, fmt.Errorf("%s must be at least 1", key)
	}
	return value, nil
}

func parseBool(lookup LookupFunc, key string, defaultValue bool) (bool, error) {
	raw, ok := lookup(key)
	if !ok {
		return defaultValue, nil
	}
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return false, fmt.Errorf("%s must be a boolean: %w", key, err)
	}
	return value, nil
}

func parseConcurrencyOverrides(lookup LookupFunc, key string) (map[string]int, error) {
	raw, ok := lookup(key)
	if !ok || strings.TrimSpace(raw) == "" {
		return map[string]int{}, nil
	}
	result := map[string]int{}
	for _, item := range strings.Split(raw, ",") {
		name, limit, err := parseConcurrencyOverrideItem(key, item)
		if err != nil {
			return nil, err
		}
		result[name] = limit
	}
	return result, nil
}

func parseConcurrencyOverrideItem(key string, item string) (string, int, error) {
	parts := strings.Split(strings.TrimSpace(item), "=")
	if len(parts) != 2 || strings.TrimSpace(parts[0]) == "" {
		return "", 0, fmt.Errorf("%s must be name=limit pairs", key)
	}
	limit, err := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err != nil {
		return "", 0, fmt.Errorf("%s limit must be an integer: %w", key, err)
	}
	if limit < 1 {
		return "", 0, fmt.Errorf("%s limit must be at least 1", key)
	}
	return strings.TrimSpace(parts[0]), limit, nil
}
