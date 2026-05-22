package workercontrol

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type Store interface {
	UpsertWorker(context.Context, RegisterWorkerRequest) (WorkerNode, error)
	UpdateHeartbeat(context.Context, HeartbeatRequest) (WorkerNode, error)
	UpdateStatus(context.Context, StatusRequest) (WorkerNode, error)
	GetWorker(context.Context, string) (WorkerNode, error)
	ListWorkers(context.Context) ([]WorkerNode, error)
	LoadRuntimeConfigValue(context.Context, string) ([]byte, bool, error)
	UpsertRuntimeConfig(context.Context, RuntimeConfigRecord) error
	InsertOpsEvent(context.Context, OpsEvent) error
}

func RegisterWorker(ctx context.Context, store Store, request RegisterWorkerRequest) (WorkerNode, error) {
	if err := validateRegisterRequest(request); err != nil {
		return WorkerNode{}, err
	}
	request.Now = normalizedNow(request.Now)
	node, err := store.UpsertWorker(ctx, request)
	if err != nil {
		return WorkerNode{}, fmt.Errorf("register worker node: %w", err)
	}
	if err := store.InsertOpsEvent(ctx, workerEvent(OpsEventWorkerRegistered, node, request.Now)); err != nil {
		return WorkerNode{}, fmt.Errorf("record worker register event: %w", err)
	}
	return node, nil
}

func HeartbeatWorker(ctx context.Context, store Store, request HeartbeatRequest) (WorkerNode, error) {
	if strings.TrimSpace(request.ID) == "" {
		return WorkerNode{}, fmt.Errorf("worker id is required")
	}
	request.Now = normalizedNow(request.Now)
	node, err := store.UpdateHeartbeat(ctx, request)
	if err != nil {
		return WorkerNode{}, fmt.Errorf("heartbeat worker node: %w", err)
	}
	return node, nil
}

func MarkDraining(ctx context.Context, store Store, id string) (WorkerNode, error) {
	return markStatus(ctx, store, id, WorkerStatusDraining, OpsEventWorkerDraining)
}

func MarkRunning(ctx context.Context, store Store, id string) (WorkerNode, error) {
	return markStatus(ctx, store, id, WorkerStatusRunning, OpsEventWorkerResumed)
}

func ResumeWorker(ctx context.Context, store Store, id string) (WorkerNode, error) {
	return MarkRunning(ctx, store, id)
}

func MarkStopped(ctx context.Context, store Store, id string) (WorkerNode, error) {
	return markStatus(ctx, store, id, WorkerStatusStopped, OpsEventWorkerStopped)
}

func LoadRuntimeConfig(ctx context.Context, store Store, key string) (RuntimeConfig, bool, error) {
	normalizedKey, err := normalizeConfigKey(key)
	if err != nil {
		return RuntimeConfig{}, false, err
	}
	raw, found, err := store.LoadRuntimeConfigValue(ctx, normalizedKey)
	if err != nil {
		return RuntimeConfig{}, false, fmt.Errorf("load runtime config: %w", err)
	}
	if !found {
		return RuntimeConfig{}, false, nil
	}
	config, err := DecodeRuntimeConfig(raw)
	return config, true, err
}

func UpdateRuntimeConfig(ctx context.Context, store Store, request UpdateRuntimeConfigRequest) (RuntimeConfig, error) {
	key, err := normalizeConfigKey(request.ConfigKey)
	if err != nil {
		return RuntimeConfig{}, err
	}
	if err := ValidateRuntimeConfig(request.Config); err != nil {
		return RuntimeConfig{}, err
	}
	raw, err := json.Marshal(request.Config)
	if err != nil {
		return RuntimeConfig{}, fmt.Errorf("encode runtime config: %w", err)
	}
	now := normalizedNow(request.Now)
	if err := store.UpsertRuntimeConfig(ctx, RuntimeConfigRecord{ConfigKey: key, Value: raw, UpdatedAt: now}); err != nil {
		return RuntimeConfig{}, fmt.Errorf("update runtime config: %w", err)
	}
	if err := store.InsertOpsEvent(ctx, runtimeConfigEvent(key, request.Config, now)); err != nil {
		return RuntimeConfig{}, fmt.Errorf("record runtime config event: %w", err)
	}
	return request.Config, nil
}

func ListWorkers(ctx context.Context, store Store) ([]WorkerNode, error) {
	workers, err := store.ListWorkers(ctx)
	if err != nil {
		return nil, fmt.Errorf("list worker nodes: %w", err)
	}
	return workers, nil
}

func GetWorker(ctx context.Context, store Store, id string) (WorkerNode, error) {
	if strings.TrimSpace(id) == "" {
		return WorkerNode{}, fmt.Errorf("worker id is required")
	}
	worker, err := store.GetWorker(ctx, id)
	if err != nil {
		return WorkerNode{}, fmt.Errorf("get worker node: %w", err)
	}
	return worker, nil
}

func DecodeRuntimeConfig(raw []byte) (RuntimeConfig, error) {
	var config RuntimeConfig
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&config); err != nil {
		return RuntimeConfig{}, fmt.Errorf("decode runtime config: %w", err)
	}
	if err := ValidateRuntimeConfig(config); err != nil {
		return RuntimeConfig{}, err
	}
	return config, nil
}

func ValidateRuntimeConfig(config RuntimeConfig) error {
	if err := validatePositivePointer("concurrency", config.Concurrency); err != nil {
		return err
	}
	if err := validatePositivePointer("poll_interval_seconds", config.PollIntervalSeconds); err != nil {
		return err
	}
	return validatePositivePointer("provider_concurrency_default", config.ProviderConcurrencyDefault)
}

func markStatus(ctx context.Context, store Store, id string, status string, eventType string) (WorkerNode, error) {
	request := StatusRequest{ID: strings.TrimSpace(id), Status: status, Now: time.Now().UTC()}
	if request.ID == "" {
		return WorkerNode{}, fmt.Errorf("worker id is required")
	}
	node, err := store.UpdateStatus(ctx, request)
	if err != nil {
		return WorkerNode{}, fmt.Errorf("mark worker %s: %w", status, err)
	}
	if err := store.InsertOpsEvent(ctx, workerEvent(eventType, node, request.Now)); err != nil {
		return WorkerNode{}, fmt.Errorf("record worker status event: %w", err)
	}
	return node, nil
}

func validateRegisterRequest(request RegisterWorkerRequest) error {
	if strings.TrimSpace(request.ID) == "" || strings.TrimSpace(request.WorkerName) == "" {
		return fmt.Errorf("worker id and worker name are required")
	}
	if strings.TrimSpace(request.Mode) == "" {
		return fmt.Errorf("worker mode is required")
	}
	if request.Concurrency < 1 {
		return fmt.Errorf("worker concurrency must be positive")
	}
	return nil
}

func validatePositivePointer(name string, value *int) error {
	if value != nil && *value < 1 {
		return fmt.Errorf("runtime config %s must be positive", name)
	}
	return nil
}

func normalizedNow(now time.Time) time.Time {
	if now.IsZero() {
		return time.Now().UTC()
	}
	return now.UTC()
}

func normalizeConfigKey(key string) (string, error) {
	trimmed := strings.TrimSpace(key)
	if trimmed == "" {
		return "", fmt.Errorf("runtime config key is required")
	}
	return trimmed, nil
}

func workerEvent(eventType string, node WorkerNode, now time.Time) OpsEvent {
	return OpsEvent{
		EventType: eventType, TargetType: "worker_node", TargetID: node.ID,
		Payload:   map[string]any{"worker_name": node.WorkerName, "status": node.Status, "mode": node.Mode},
		CreatedAt: now,
	}
}

func runtimeConfigEvent(key string, config RuntimeConfig, now time.Time) OpsEvent {
	return OpsEvent{
		EventType: OpsEventRuntimeConfigUpdated, TargetType: DefaultRuntimeConfigTargetType, TargetID: key,
		Payload: map[string]any{"config": config}, CreatedAt: now,
	}
}
