package workercontrol

import "time"

const (
	WorkerStatusStarting  = "starting"
	WorkerStatusRunning   = "running"
	WorkerStatusDraining  = "draining"
	WorkerStatusStopped   = "stopped"
	WorkerStatusUnhealthy = "unhealthy"

	OpsEventWorkerRegistered       = "worker.registered"
	OpsEventWorkerDraining         = "worker.draining"
	OpsEventWorkerResumed          = "worker.resumed"
	OpsEventWorkerStopped          = "worker.stopped"
	OpsEventRuntimeConfigUpdated   = "runtime_config.updated"
	DefaultRuntimeConfigKey        = "worker-go"
	DefaultRuntimeConfigTargetType = "worker_runtime_config"
)

type WorkerNode struct {
	ID              string
	WorkerName      string
	Hostname        string
	Version         string
	Status          string
	Mode            string
	Concurrency     int
	StartedAt       time.Time
	LastHeartbeatAt time.Time
	Metadata        map[string]any
}

type RegisterWorkerRequest struct {
	ID          string
	WorkerName  string
	Hostname    string
	Version     string
	Mode        string
	Concurrency int
	Metadata    map[string]any
	Now         time.Time
}

type HeartbeatRequest struct {
	ID  string
	Now time.Time
}

type StatusRequest struct {
	ID     string
	Status string
	Now    time.Time
}

type RuntimeConfig struct {
	Concurrency                *int  `json:"concurrency,omitempty"`
	PollIntervalSeconds        *int  `json:"poll_interval_seconds,omitempty"`
	ProviderConcurrencyDefault *int  `json:"provider_concurrency_default,omitempty"`
	Drain                      *bool `json:"drain,omitempty"`
}

type RuntimeConfigRecord struct {
	ConfigKey string
	Value     []byte
	UpdatedAt time.Time
}

type UpdateRuntimeConfigRequest struct {
	ConfigKey string
	Config    RuntimeConfig
	Now       time.Time
}

type OpsEvent struct {
	EventType  string
	TargetType string
	TargetID   string
	Payload    map[string]any
	CreatedAt  time.Time
}
