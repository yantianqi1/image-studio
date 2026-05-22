package jobs

import (
	"context"
	"time"
)

func (p *Processor) controlSnapshot() ControlSnapshot {
	if p.control == nil {
		return ControlSnapshot{
			Concurrency: p.concurrency, PollInterval: p.pollInterval,
			ProviderConcurrencyDefault: p.providerConcurrencyDefault,
		}
	}
	return p.control.Snapshot()
}

func (p *Processor) waitNextPoll(ctx context.Context) bool {
	timer := time.NewTimer(p.controlSnapshot().PollInterval)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
