package observability

import (
	"fmt"
	"slices"
	"strings"
	"sync"
)

const (
	MetricClaimTotal       = "image_worker_claim_total"
	MetricClaimEmptyTotal  = "image_worker_claim_empty_total"
	MetricItemStartedTotal = "image_worker_item_started_total"
	MetricItemSuccessTotal = "image_worker_item_succeeded_total"
	MetricItemFailedTotal  = "image_worker_item_failed_total"
	MetricItemRetriedTotal = "image_worker_item_retried_total"
	MetricHeartbeatFailed  = "image_worker_heartbeat_failed_total"
)

var histogramBuckets = []float64{1, 5, 15, 30, 60, 120, 300}

type Metrics struct {
	mu               sync.Mutex
	counters         map[string]float64
	runningItems     float64
	providerInflight map[string]float64
	renderDuration   *histogram
	queueWait        *histogram
}

type histogram struct {
	name   string
	counts []float64
	count  float64
	sum    float64
}

func NewMetrics() *Metrics {
	return &Metrics{
		counters: map[string]float64{
			MetricClaimTotal:       0,
			MetricClaimEmptyTotal:  0,
			MetricItemStartedTotal: 0,
			MetricItemSuccessTotal: 0,
			MetricItemFailedTotal:  0,
			MetricItemRetriedTotal: 0,
			MetricHeartbeatFailed:  0,
		},
		providerInflight: map[string]float64{},
		renderDuration:   newHistogram("image_worker_render_duration_seconds"),
		queueWait:        newHistogram("image_worker_queue_wait_seconds"),
	}
}

func (m *Metrics) IncClaim(count int)  { m.addCounter(MetricClaimTotal, float64(count)) }
func (m *Metrics) IncClaimEmpty()      { m.addCounter(MetricClaimEmptyTotal, 1) }
func (m *Metrics) IncItemStarted()     { m.addCounter(MetricItemStartedTotal, 1) }
func (m *Metrics) IncItemSucceeded()   { m.addCounter(MetricItemSuccessTotal, 1) }
func (m *Metrics) IncItemFailed()      { m.addCounter(MetricItemFailedTotal, 1) }
func (m *Metrics) IncItemRetried()     { m.addCounter(MetricItemRetriedTotal, 1) }
func (m *Metrics) IncHeartbeatFailed() { m.addCounter(MetricHeartbeatFailed, 1) }

func (m *Metrics) AddRunningItems(delta int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.runningItems += float64(delta)
}

func (m *Metrics) AddProviderInflight(provider string, delta int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := strings.TrimSpace(provider)
	if key == "" {
		key = "unknown"
	}
	m.providerInflight[key] += float64(delta)
}

func (m *Metrics) ObserveRenderDuration(seconds float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.renderDuration.observe(seconds)
}

func (m *Metrics) ObserveQueueWait(seconds float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.queueWait.observe(seconds)
}

func (m *Metrics) PrometheusText() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	var builder strings.Builder
	writeCounters(&builder, m.counters)
	fmt.Fprintf(&builder, "image_worker_running_items %s\n", formatFloat(m.runningItems))
	writeProviderGauge(&builder, m.providerInflight)
	m.renderDuration.writePrometheus(&builder)
	m.queueWait.writePrometheus(&builder)
	return builder.String()
}

func (m *Metrics) addCounter(name string, delta float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.counters[name] += delta
}

func newHistogram(name string) *histogram {
	return &histogram{name: name, counts: make([]float64, len(histogramBuckets))}
}

func (h *histogram) observe(value float64) {
	h.count++
	h.sum += value
	for index, bucket := range histogramBuckets {
		if value <= bucket {
			h.counts[index]++
		}
	}
}

func (h *histogram) writePrometheus(builder *strings.Builder) {
	for index, bucket := range histogramBuckets {
		fmt.Fprintf(builder, "%s_bucket{le=\"%s\"} %s\n", h.name, formatFloat(bucket), formatFloat(h.counts[index]))
	}
	fmt.Fprintf(builder, "%s_bucket{le=\"+Inf\"} %s\n", h.name, formatFloat(h.count))
	fmt.Fprintf(builder, "%s_count %s\n", h.name, formatFloat(h.count))
	fmt.Fprintf(builder, "%s_sum %s\n", h.name, formatFloat(h.sum))
}

func writeCounters(builder *strings.Builder, counters map[string]float64) {
	names := make([]string, 0, len(counters))
	for name := range counters {
		names = append(names, name)
	}
	slices.Sort(names)
	for _, name := range names {
		fmt.Fprintf(builder, "%s %s\n", name, formatFloat(counters[name]))
	}
}

func writeProviderGauge(builder *strings.Builder, values map[string]float64) {
	names := make([]string, 0, len(values))
	for name := range values {
		names = append(names, name)
	}
	slices.Sort(names)
	if len(names) == 0 {
		fmt.Fprintln(builder, "image_worker_provider_inflight{provider=\"unknown\"} 0")
		return
	}
	for _, name := range names {
		fmt.Fprintf(builder, "image_worker_provider_inflight{provider=\"%s\"} %s\n", labelValue(name), formatFloat(values[name]))
	}
}

func labelValue(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "\\", "\\\\"), "\"", "\\\"")
}

func formatFloat(value float64) string {
	return fmt.Sprintf("%g", value)
}
