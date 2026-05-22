package jobs

import (
	"context"
	"time"
)

func (p *Processor) processSimulationJob(ctx context.Context, itemID int64) {
	p.metrics.IncItemStarted()
	p.logger.Info("image job item simulation started", "item_id", itemID, "worker_name", p.workerName)
	timer := time.NewTimer(p.simulateDuration)
	ticker := time.NewTicker(p.heartbeatInterval)
	defer timer.Stop()
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			p.logger.Info("image job item simulation stopped", "item_id", itemID)
			return
		case <-ticker.C:
			if !p.sendHeartbeat(ctx, itemID) {
				return
			}
		case <-timer.C:
			p.finishSimulation(ctx, itemID)
			return
		}
	}
}

func (p *Processor) sendHeartbeat(ctx context.Context, itemID int64) bool {
	ok, err := p.store.Heartbeat(ctx, LeaseRequest{
		ItemID: itemID, WorkerName: p.workerName, LeaseSeconds: p.leaseSeconds,
	})
	if err != nil {
		p.logger.Error("image job item heartbeat failed", "item_id", itemID, "error", err)
		p.metrics.IncHeartbeatFailed()
		return false
	}
	if !ok {
		p.logger.Error("image job heartbeat did not update a running locked item", "item_id", itemID)
		p.metrics.IncHeartbeatFailed()
		return false
	}
	return true
}

func (p *Processor) finishSimulation(ctx context.Context, itemID int64) {
	p.markFailed(ctx, itemID)
}

func (p *Processor) markFailed(ctx context.Context, itemID int64) {
	ok, err := p.store.MarkFailed(ctx, FailRequest{
		ItemID: itemID, WorkerName: p.workerName, Message: simulatedFailureMessage,
	})
	if err != nil {
		p.logger.Error("image job item failed update failed", "item_id", itemID, "error", err)
		return
	}
	if !ok {
		p.logger.Error("image job item failed update did not match lock", "item_id", itemID)
		return
	}
	p.metrics.IncItemFailed()
	p.logger.Info("image job item simulation failed", "item_id", itemID)
}
