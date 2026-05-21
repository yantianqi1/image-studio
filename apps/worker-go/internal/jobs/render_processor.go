package jobs

import (
	"context"
	"errors"
	"time"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/provider"
)

func (p *Processor) processRenderJob(ctx context.Context, itemID int64) {
	renderCtx, cancel := context.WithTimeout(ctx, p.renderTimeout)
	heartbeatDone := p.startHeartbeat(renderCtx, itemID, cancel)
	startedAt := time.Now()
	job, err := p.executeRenderJob(renderCtx, itemID)
	cancel()
	<-heartbeatDone
	if err == nil {
		p.metrics.IncItemSucceeded()
		p.metrics.ObserveRenderDuration(time.Since(startedAt).Seconds())
		p.logger.Info("image job item render succeeded", renderLogAttrs(p.workerName, itemID, job)...)
		return
	}
	if isContextCanceledByParent(ctx, err) {
		p.logger.Info("image job item render stopped", renderLogAttrs(p.workerName, itemID, job)...)
		return
	}
	p.handleRenderFailure(context.Background(), itemID, job, err)
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

func (p *Processor) executeRenderJob(ctx context.Context, itemID int64) (*provider.JobContext, error) {
	lock := JobLock{ItemID: itemID, WorkerName: p.workerName}
	job, err := p.store.LoadJobContext(ctx, lock)
	if err != nil {
		return nil, err
	}
	p.metrics.IncItemStarted()
	p.observeQueueWait(*job)
	p.logger.Info("image job item render started", renderLogAttrs(p.workerName, itemID, job)...)
	renderer, err := p.rendererFactory.RendererFor(*job)
	if err != nil {
		return job, err
	}
	results, err := p.renderResults(ctx, renderer, *job)
	if err != nil {
		return job, err
	}
	err = p.store.CompleteRenderedJob(ctx, CompleteRenderRequest{
		Lock: lock, Job: job, Results: results, Storage: p.assetStorage,
	})
	return job, err
}

func (p *Processor) renderResults(
	ctx context.Context,
	renderer provider.Renderer,
	job provider.JobContext,
) ([]*provider.RenderedImage, error) {
	if job.ResultIndex < 1 {
		return nil, provider.NewError("image_job_item_result_index_invalid", "image job item result index invalid", true)
	}
	release, err := p.acquireRenderLimiters(ctx, job)
	if err != nil {
		return nil, err
	}
	defer release()
	providerKey := providerLimiterKey(job)
	p.metrics.AddProviderInflight(providerKey, 1)
	rendered, err := renderer.Render(ctx, job)
	p.metrics.AddProviderInflight(providerKey, -1)
	if err != nil {
		return nil, err
	}
	return []*provider.RenderedImage{rendered}, nil
}

func (p *Processor) handleRenderFailure(ctx context.Context, itemID int64, job *provider.JobContext, err error) {
	if errors.Is(err, context.DeadlineExceeded) {
		p.logger.Error("image job item render timed out", renderLogAttrs(p.workerName, itemID, job)...)
	} else {
		attrs := append(renderLogAttrs(p.workerName, itemID, job), "error", err)
		p.logger.Error("image job item render failed", attrs...)
	}
	outcome, updateErr := p.store.HandleRenderFailure(ctx, RenderFailureRequest{
		ItemID: itemID, WorkerName: p.workerName,
		Error: err, RetryBaseSeconds: p.retryBaseSeconds, RetryMaxSeconds: p.retryMaxSeconds,
	})
	if updateErr != nil {
		attrs := append(renderLogAttrs(p.workerName, itemID, job), "error", updateErr)
		p.logger.Error("image job item failure update failed", attrs...)
		return
	}
	if !outcome.Updated {
		p.logger.Error("image job item failure update did not match lock", renderLogAttrs(p.workerName, itemID, job)...)
		return
	}
	if outcome.Retried {
		p.metrics.IncItemRetried()
		p.logger.Info("image job item retry scheduled", renderLogAttrs(p.workerName, itemID, job)...)
		return
	}
	p.metrics.IncItemFailed()
}

func (p *Processor) observeQueueWait(job provider.JobContext) {
	if job.ItemAvailableAt.IsZero() {
		return
	}
	wait := time.Since(job.ItemAvailableAt).Seconds()
	if wait >= 0 {
		p.metrics.ObserveQueueWait(wait)
	}
}
