package jobs

import (
	"context"
	"strings"
	"sync"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/provider"
)

const unnamedLimiterKey = "_default"

type limiterPool struct {
	mu         sync.Mutex
	semaphores map[string]*limiterSemaphore
}

type limiterSemaphore struct {
	limit     int
	semaphore chan struct{}
	waiters   int
}

func newLimiterPool() *limiterPool {
	return &limiterPool{semaphores: map[string]*limiterSemaphore{}}
}

func (p *Processor) acquireRenderLimiters(ctx context.Context, job provider.JobContext) (func(), error) {
	providerKey, providerLimit := p.providerLimiterSpec(job)
	providerRelease, err := p.providerLimiter.acquire(ctx, providerKey, providerLimit)
	if err != nil {
		return nil, err
	}
	modelRelease, err := p.modelLimiter.acquire(ctx, modelLimiterKey(job), p.modelConcurrencyDefault)
	if err != nil {
		providerRelease()
		return nil, err
	}
	return func() {
		modelRelease()
		providerRelease()
	}, nil
}

func (l *limiterPool) acquire(ctx context.Context, key string, limit int) (func(), error) {
	entry := l.semaphore(key, limit)
	if release, ok := l.tryAcquire(entry); ok {
		return release, nil
	}
	l.mu.Lock()
	entry.waiters++
	l.mu.Unlock()
	select {
	case entry.semaphore <- struct{}{}:
		l.finishWait(entry)
		return limiterRelease(entry), nil
	case <-ctx.Done():
		l.finishWait(entry)
		return nil, ctx.Err()
	}
}

func (l *limiterPool) semaphore(key string, limit int) *limiterSemaphore {
	normalizedKey := normalizeLimiterKey(key)
	l.mu.Lock()
	defer l.mu.Unlock()
	if current, ok := l.semaphores[normalizedKey]; ok {
		if !canResizeLimiter(current, limit) {
			return current
		}
	}
	entry := &limiterSemaphore{limit: limit, semaphore: make(chan struct{}, limit)}
	l.semaphores[normalizedKey] = entry
	return entry
}

func (l *limiterPool) tryAcquire(entry *limiterSemaphore) (func(), bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(entry.semaphore) >= entry.limit {
		return nil, false
	}
	entry.semaphore <- struct{}{}
	return limiterRelease(entry), true
}

func (l *limiterPool) finishWait(entry *limiterSemaphore) {
	l.mu.Lock()
	defer l.mu.Unlock()
	entry.waiters--
}

func canResizeLimiter(current *limiterSemaphore, nextLimit int) bool {
	return current.limit != nextLimit && len(current.semaphore) == 0 && current.waiters == 0
}

func limiterRelease(entry *limiterSemaphore) func() {
	var once sync.Once
	return func() { once.Do(func() { <-entry.semaphore }) }
}

func (p *Processor) providerLimiterSpec(job provider.JobContext) (string, int) {
	name := strings.TrimSpace(job.Provider.Name)
	if limit, ok := p.providerConcurrencyOverrides[name]; ok && name != "" {
		return "name:" + name, limit
	}
	providerType := strings.TrimSpace(job.Provider.Type)
	if limit, ok := p.providerConcurrencyOverrides[providerType]; ok && providerType != "" {
		return "type:" + providerType, limit
	}
	return providerLimiterKey(job), p.controlSnapshot().ProviderConcurrencyDefault
}

func providerLimiterKey(job provider.JobContext) string {
	if key := strings.TrimSpace(job.Provider.Name); key != "" {
		return key
	}
	return strings.TrimSpace(job.Provider.Type)
}

func modelLimiterKey(job provider.JobContext) string {
	model := strings.TrimSpace(job.ProviderModel)
	if model == "" {
		model = strings.TrimSpace(job.Provider.DefaultModel)
	}
	return providerLimiterKey(job) + ":" + model
}

func normalizeLimiterKey(key string) string {
	trimmed := strings.TrimSpace(key)
	if trimmed == "" {
		return unnamedLimiterKey
	}
	return trimmed
}

func cloneLimiterOverrides(values map[string]int) map[string]int {
	clone := make(map[string]int, len(values))
	for key, value := range values {
		clone[strings.TrimSpace(key)] = value
	}
	return clone
}
