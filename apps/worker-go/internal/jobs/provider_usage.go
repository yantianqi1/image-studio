package jobs

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/provider"
)

type providerUsageRecord struct {
	JobID                int64
	ItemID               int64
	ProviderID           int64
	ProviderName         string
	ProviderModel        string
	InputTokens          any
	OutputTokens         any
	TotalTokens          any
	RawProviderCostCents any
	ProviderFeeCents     any
	InternalCostCents    any
	RawPayload           any
}

func recordProviderUsage(
	ctx context.Context,
	tx pgx.Tx,
	job *provider.JobContext,
	itemID int64,
	usage *provider.Usage,
) error {
	if usage == nil {
		return nil
	}
	record, err := buildProviderUsageRecord(job, itemID, usage)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, insertProviderUsageEventSQL, record.eventArgs()...); err != nil {
		return fmt.Errorf("insert provider usage event: %w", err)
	}
	if _, err := tx.Exec(ctx, aggregateProviderUsageSQL, record.aggregateArgs()...); err != nil {
		return fmt.Errorf("aggregate provider usage: %w", err)
	}
	return nil
}

func buildProviderUsageRecord(
	job *provider.JobContext,
	itemID int64,
	usage *provider.Usage,
) (providerUsageRecord, error) {
	rawPayload, err := marshalUsagePayload(usage.RawPayload)
	if err != nil {
		return providerUsageRecord{}, err
	}
	return providerUsageRecord{
		JobID: job.ID, ItemID: itemID, ProviderID: job.Provider.ID,
		ProviderName: job.Provider.Name, ProviderModel: job.ProviderModel,
		InputTokens:          int64OrNil(usage.InputTokens),
		OutputTokens:         int64OrNil(usage.OutputTokens),
		TotalTokens:          int64OrNil(usage.TotalTokens),
		RawProviderCostCents: int64OrNil(usage.RawProviderCostCents),
		ProviderFeeCents:     int64OrNil(usage.ProviderFeeCents),
		InternalCostCents:    int64OrNil(usage.InternalCostCents),
		RawPayload:           rawPayload,
	}, nil
}

func (r providerUsageRecord) eventArgs() []any {
	return []any{
		r.JobID, r.ItemID, r.ProviderID, r.ProviderName, r.ProviderModel,
		r.InputTokens, r.OutputTokens, r.TotalTokens,
		r.RawProviderCostCents, r.ProviderFeeCents, r.InternalCostCents, r.RawPayload,
	}
}

func (r providerUsageRecord) aggregateArgs() []any {
	return []any{
		r.JobID, r.InputTokens, r.OutputTokens, r.TotalTokens,
		r.RawProviderCostCents, r.ProviderFeeCents, r.InternalCostCents, r.RawPayload,
	}
}

func int64OrNil(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}

func marshalUsagePayload(payload map[string]any) (any, error) {
	if payload == nil {
		return nil, nil
	}
	content, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal provider usage payload: %w", err)
	}
	return string(content), nil
}
