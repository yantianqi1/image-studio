package jobs

import "time"

type ControlSnapshot struct {
	Drain                      bool
	Concurrency                int
	PollInterval               time.Duration
	ProviderConcurrencyDefault int
}

type ControlSource interface {
	Snapshot() ControlSnapshot
}
