package provider

import (
	"encoding/json"
	"fmt"
	"math/big"
	"strconv"
)

func parseOpenRouterUsage(payload map[string]any) (*Usage, error) {
	usage, ok := payload["usage"].(map[string]any)
	if !ok {
		return nil, NewError("provider_usage_missing", "openrouter usage missing", false)
	}
	input, err := requireUsageInt(usage, "prompt_tokens")
	if err != nil {
		return nil, err
	}
	output, err := requireUsageInt(usage, "completion_tokens")
	if err != nil {
		return nil, err
	}
	total, err := requireUsageInt(usage, "total_tokens")
	if err != nil {
		return nil, err
	}
	internal, err := requireCostCents(usage, "cost")
	if err != nil {
		return nil, err
	}
	raw, err := parseOpenRouterUpstreamCost(usage)
	if err != nil {
		return nil, err
	}
	fee, err := providerFeeCents(internal, raw)
	if err != nil {
		return nil, err
	}
	return &Usage{InputTokens: input, OutputTokens: output, TotalTokens: total, RawProviderCostCents: raw, ProviderFeeCents: fee, InternalCostCents: internal, RawPayload: cloneMap(usage)}, nil
}

func requireUsageInt(usage map[string]any, key string) (*int64, error) {
	value, ok := parseUsageInt(usage[key])
	if !ok || value < 0 {
		return nil, NewError("provider_usage_invalid", "openrouter usage "+key+" invalid", false)
	}
	return &value, nil
}

func parseUsageInt(value any) (int64, bool) {
	switch typed := value.(type) {
	case json.Number:
		parsed, err := strconv.ParseInt(typed.String(), 10, 64)
		return parsed, err == nil
	case float64:
		parsed := int64(typed)
		return parsed, typed == float64(parsed)
	case int:
		return int64(typed), true
	case int64:
		return typed, true
	default:
		return 0, false
	}
}

func requireCostCents(usage map[string]any, key string) (*int64, error) {
	cents, err := optionalCostCents(usage[key])
	if err != nil {
		return nil, err
	}
	if cents == nil {
		return nil, NewError("provider_usage_invalid", "openrouter usage "+key+" invalid", false)
	}
	return cents, nil
}

func parseOpenRouterUpstreamCost(usage map[string]any) (*int64, error) {
	details, ok := usage["cost_details"].(map[string]any)
	if !ok {
		return nil, nil
	}
	return optionalCostCents(details["upstream_inference_cost"])
}

func optionalCostCents(value any) (*int64, error) {
	if value == nil {
		return nil, nil
	}
	rat, ok := new(big.Rat).SetString(numericString(value))
	if !ok || rat.Sign() < 0 {
		return nil, NewError("provider_usage_invalid", "openrouter usage cost invalid", false)
	}
	rat.Mul(rat, big.NewRat(100, 1))
	cents := ceilRat(rat)
	return &cents, nil
}

func numericString(value any) string {
	if number, ok := value.(json.Number); ok {
		return number.String()
	}
	return fmt.Sprint(value)
}

func ceilRat(value *big.Rat) int64 {
	quotient := new(big.Int)
	remainder := new(big.Int)
	quotient.QuoRem(value.Num(), value.Denom(), remainder)
	if remainder.Sign() > 0 {
		quotient.Add(quotient, big.NewInt(1))
	}
	return quotient.Int64()
}

func providerFeeCents(cost *int64, upstream *int64) (*int64, error) {
	if upstream == nil {
		return nil, nil
	}
	if *upstream > *cost {
		return nil, NewError("provider_usage_invalid", "openrouter usage cost invalid", false)
	}
	fee := *cost - *upstream
	return &fee, nil
}

func cloneMap(value map[string]any) map[string]any {
	result := make(map[string]any, len(value))
	for key, item := range value {
		result[key] = item
	}
	return result
}
