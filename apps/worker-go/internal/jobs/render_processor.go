package jobs

import (
	"context"
	"errors"
	"time"

	"github.com/yantianqi1/image-studio/apps/worker-go/internal/provider"
)

func (p *Processor) processRenderJob(ctx context.Context, itemID int64) {
	p.logger.Info("image job item render started", "item_id", itemID)
	renderCtx, cancel := context.WithTimeout(ctx, p.renderTimeout)
	heartbeatDone := p.startHeartbeat(renderCtx, itemID, cancel)
	err := p.executeRenderJob(renderCtx, itemID)
	cancel()
	<-heartbeatDone
	if err == nil {
		p.logger.Info("image job item render succeeded", "item_id", itemID)
		return
	}
	if isContextCanceledByParent(ctx, err) {
		p.logger.Info("image job item render stopped", "item_id", itemID)
		return
	}
	p.handleRenderFailure(context.Background(), itemID, err)
}

func (p *Processor) startHeartbeat(ctx context.Context, itemID int64, cancel context.CancelFunc) <-chan struct{} {
	done := make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(p.heartbeatInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if !p.sendHeartbeat(ctx, itemID) {
					cancel()
					return
				}
			}
		}
	}()
	return done
}

func (p *Processor) executeRenderJob(ctx context.Context, itemID int64) error {
	lock := JobLock{ItemID: itemID, WorkerName: p.workerName}
	job, err := p.store.LoadJobContext(ctx, lock)
	if err != nil {
		return err
	}
	renderer, err := p.rendererFactory.RendererFor(*job)
	if err != nil {
		return err
	}
	results, err := p.renderResults(ctx, renderer, *job)
	if err != nil {
		return err
	}
	return p.store.CompleteRenderedJob(ctx, CompleteRenderRequest{
		Lock: lock, Job: job, Results: results, Storage: p.assetStorage,
	})
}

func (p *Processor) renderResults(
	ctx context.Context,
	renderer provider.Renderer,
	job provider.JobContext,
) ([]*provider.RenderedImage, error) {
	if job.ResultIndex < 1 {
		return nil, provider.NewError("image_job_item_result_index_invalid", "image job item result index invalid", true)
	}
	rendered, err := renderer.Render(ctx, job)
	if err != nil {
		return nil, err
	}
	return []*provider.RenderedImage{rendered}, nil
}

func (p *Processor) handleRenderFailure(ctx context.Context, itemID int64, err error) {
	if errors.Is(err, context.DeadlineExceeded) {
		p.logger.Error("image job item render timed out", "item_id", itemID)
	} else {
		p.logger.Error("image job item render failed", "item_id", itemID, "error", err)
	}
	ok, updateErr := p.store.HandleRenderFailure(ctx, RenderFailureRequest{
		ItemID: itemID, WorkerName: p.workerName,
		Error: err, RetryDelaySeconds: p.retryDelaySeconds,
	})
	if updateErr != nil {
		p.logger.Error("image job item failure update failed", "item_id", itemID, "error", updateErr)
		return
	}
	if !ok {
		p.logger.Error("image job item failure update did not match lock", "item_id", itemID)
	}
}
