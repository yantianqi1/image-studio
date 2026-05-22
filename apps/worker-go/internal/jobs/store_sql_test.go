package jobs

import (
	"strings"
	"testing"
)

func TestRenderFailureSQLSchedulesRetryAndClearsLock(t *testing.T) {
	required := []string{
		"status='queued'",
		"available_at=now() + ($4::int * interval '1 second')",
		"error_code=$3",
		"last_error_code=$3",
		"last_error_message=$5",
		"locked_by=NULL",
		"lease_expires_at=NULL",
	}
	for _, text := range required {
		if !strings.Contains(MarkRetryableFailureSQL, text) {
			t.Fatalf("retry SQL missing %q:\n%s", text, MarkRetryableFailureSQL)
		}
	}
}

func TestRenderFailureSQLMarksTerminalFailure(t *testing.T) {
	required := []string{
		"status='failed'",
		"finished_at=now()",
		"dead_letter_at=now()",
		"available_at=now()",
		"error_code=$3",
		"last_error_code=$3",
		"last_error_message=$4",
		"locked_by=NULL",
		"lease_expires_at=NULL",
	}
	for _, text := range required {
		if !strings.Contains(MarkTerminalFailureSQL, text) {
			t.Fatalf("terminal SQL missing %q:\n%s", text, MarkTerminalFailureSQL)
		}
	}
}

func TestRenderClaimSQLOnlyClaimsSupportedProviderType(t *testing.T) {
	required := []string{
		"FROM image_job_items i",
		"JOIN image_jobs j ON j.id = i.job_id",
		"JOIN providers p ON p.id = j.provider_id",
		"p.type = ANY($6::text[])",
	}
	for _, text := range required {
		if !strings.Contains(ClaimQueuedRenderSQL, text) {
			t.Fatalf("render claim SQL missing %q:\n%s", text, ClaimQueuedRenderSQL)
		}
	}
	if strings.Contains(ClaimQueuedRenderSQL, "j.client_provider_config IS NULL") {
		t.Fatalf("render claim SQL still excludes client provider jobs:\n%s", ClaimQueuedRenderSQL)
	}
}

func TestClaimSQLSkipsOwnersAtConcurrencyLimit(t *testing.T) {
	required := []string{
		"expired_leases AS",
		"lease_expires_at <= now()",
		"status='queued'",
		"owner_running_count",
		"owner_limit",
		"ROW_NUMBER() OVER",
		"ORDER BY priority DESC, scheduler_score DESC, available_at ASC, id ASC",
		"dead_letter_at IS NULL",
		"owner_queue_rank <= GREATEST(owner_limit - owner_running_count, 0)",
		"FOR UPDATE OF i SKIP LOCKED",
	}
	for _, sql := range []string{ClaimQueuedSQL, ClaimQueuedRenderSQL} {
		for _, text := range required {
			if !strings.Contains(sql, text) {
				t.Fatalf("claim SQL missing owner limiter %q:\n%s", text, sql)
			}
		}
	}
}

func TestClaimSQLIgnoresExpiredRunningItemsForOwnerLimit(t *testing.T) {
	required := []string{
		"ri.status = 'running'",
		"ri.lease_expires_at > now()",
	}
	for _, sql := range []string{ClaimQueuedSQL, ClaimQueuedRenderSQL} {
		for _, text := range required {
			if !strings.Contains(sql, text) {
				t.Fatalf("claim SQL counts expired running leases for owner limiter, missing %q:\n%s", text, sql)
			}
		}
	}
}

func TestRenderClaimSQLSkipsUnavailableProviders(t *testing.T) {
	required := []string{
		"LEFT JOIN provider_runtime_state prs ON prs.provider_id = p.id",
		"COALESCE(prs.status, 'healthy') <> 'paused'",
		"prs.circuit_open_until <= now()",
	}
	for _, text := range required {
		if !strings.Contains(ClaimQueuedRenderSQL, text) {
			t.Fatalf("render claim SQL missing provider state %q:\n%s", text, ClaimQueuedRenderSQL)
		}
	}
}

func TestProviderRuntimeFailureSQLOpensCircuitAtThreshold(t *testing.T) {
	required := []string{
		"INSERT INTO provider_runtime_state",
		"failure_count",
		"provider_runtime_state.failure_count + 1",
		"THEN 'circuit_open'",
		"ELSE 'degraded'",
		"circuit_open_until",
		"$3::int * interval '1 second'",
		"ON CONFLICT (provider_id) DO UPDATE",
	}
	for _, text := range required {
		if !strings.Contains(recordProviderFailureSQL, text) {
			t.Fatalf("provider failure SQL missing %q:\n%s", text, recordProviderFailureSQL)
		}
	}
}

func TestProviderRuntimeSuccessSQLPreservesPausedProvider(t *testing.T) {
	required := []string{
		"UPDATE provider_runtime_state",
		"WHEN status = 'paused' THEN 'paused'",
		"ELSE 'healthy'",
		"failure_count=0",
		"last_failure_at=NULL",
		"circuit_open_until=NULL",
	}
	for _, text := range required {
		if !strings.Contains(resetProviderSuccessSQL, text) {
			t.Fatalf("provider success SQL missing %q:\n%s", text, resetProviderSuccessSQL)
		}
	}
}

func TestRenderedAssetSQLStoresMetadataAndCreatedEvent(t *testing.T) {
	insertRequired := []string{
		"size_bytes",
		"sha256",
		"width",
		"height",
		"storage_backend",
	}
	for _, text := range insertRequired {
		if !strings.Contains(insertAssetSQL, text) {
			t.Fatalf("insert asset SQL missing metadata %q:\n%s", text, insertAssetSQL)
		}
	}
	eventRequired := []string{
		"INSERT INTO outbox_events",
		"asset.created",
		"aggregate_type, aggregate_id",
	}
	for _, text := range eventRequired {
		if !strings.Contains(insertAssetCreatedOutboxSQL, text) {
			t.Fatalf("asset created SQL missing %q:\n%s", text, insertAssetCreatedOutboxSQL)
		}
	}
}

func TestProviderUsageSQLRecordsEventAndAggregatesJob(t *testing.T) {
	eventRequired := []string{
		"INSERT INTO image_provider_usage_events",
		"job_id",
		"item_id",
		"raw_payload",
	}
	for _, text := range eventRequired {
		if !strings.Contains(insertProviderUsageEventSQL, text) {
			t.Fatalf("provider usage event SQL missing %q:\n%s", text, insertProviderUsageEventSQL)
		}
	}
	aggregateRequired := []string{
		"UPDATE image_jobs",
		"provider_input_tokens",
		"raw_provider_cost_cents",
		"internal_cost_cents",
		"provider_usage",
	}
	for _, text := range aggregateRequired {
		if !strings.Contains(aggregateProviderUsageSQL, text) {
			t.Fatalf("provider usage aggregate SQL missing %q:\n%s", text, aggregateProviderUsageSQL)
		}
	}
}

func TestProviderRuntimeSQLWritesCircuitOutboxEvents(t *testing.T) {
	cases := map[string][]string{
		recordProviderFailureSQL: {
			"INSERT INTO outbox_events",
			"provider.circuit_opened",
			"aggregate_type, aggregate_id",
		},
		resetProviderSuccessSQL: {
			"INSERT INTO outbox_events",
			"provider.circuit_closed",
			"previous_status = 'circuit_open'",
		},
	}
	for sql, required := range cases {
		for _, text := range required {
			if !strings.Contains(sql, text) {
				t.Fatalf("provider runtime SQL missing outbox event %q:\n%s", text, sql)
			}
		}
	}
}

func TestItemCompletionSQLAggregatesParentJob(t *testing.T) {
	required := []string{
		"FROM image_job_items",
		"COUNT(*) FILTER (WHERE status = 'succeeded')",
		"COUNT(*) FILTER (WHERE status = 'failed')",
		"COUNT(*) FILTER (WHERE status = 'cancelled')",
		"counts.cancelled > 0",
		"UPDATE image_jobs",
	}
	for _, text := range required {
		if !strings.Contains(AggregateParentJobSQL, text) {
			t.Fatalf("parent aggregate SQL missing %q:\n%s", text, AggregateParentJobSQL)
		}
	}
}

func TestAggregateParentJobSQLWritesTerminalJobEvents(t *testing.T) {
	required := []string{
		"previous_status",
		"INSERT INTO image_job_events",
		"image_job.succeeded",
		"image_job.failed",
		"updated.status <> previous.previous_status",
		"INSERT INTO outbox_events",
	}
	for _, text := range required {
		if !strings.Contains(AggregateParentJobSQL, text) {
			t.Fatalf("parent aggregate SQL missing event write %q:\n%s", text, AggregateParentJobSQL)
		}
	}
}

func TestRenderCompletionLocksItemBeforeWritingResult(t *testing.T) {
	required := []string{
		"FROM image_job_items",
		"WHERE id = $1",
		"FOR UPDATE",
	}
	for _, text := range required {
		if !strings.Contains(lockCompletionItemSQL, text) {
			t.Fatalf("completion lock SQL missing %q:\n%s", text, lockCompletionItemSQL)
		}
	}
}

func TestAssetCommitFailureSQLDoesNotLeaveItemSucceeded(t *testing.T) {
	required := []string{
		"status='failed'",
		"asset_id=NULL",
		"error_code='asset_commit_failed'",
		"locked_by=NULL",
	}
	for _, text := range required {
		if !strings.Contains(markAssetCommitFailedSQL, text) {
			t.Fatalf("asset commit failure SQL missing %q:\n%s", text, markAssetCommitFailedSQL)
		}
	}
}

func TestWorkerStateChangeSQLWritesImageJobEvents(t *testing.T) {
	sqlBlocks := []string{
		ClaimQueuedSQL,
		MarkRetryableFailureSQL,
		MarkTerminalFailureSQL,
		markRenderSucceededSQL,
		markAssetCommitFailedSQL,
	}
	for _, sql := range sqlBlocks {
		if !strings.Contains(sql, "INSERT INTO image_job_events") {
			t.Fatalf("state change SQL missing image job event insert:\n%s", sql)
		}
	}
}

func TestClaimSQLWritesJobStartedOnlyOnStatusChange(t *testing.T) {
	required := []string{
		"previous_parents",
		"previous_status",
		"previous_parents.previous_status <> 'running'",
	}
	for _, sql := range []string{ClaimQueuedSQL, ClaimQueuedRenderSQL} {
		for _, text := range required {
			if !strings.Contains(sql, text) {
				t.Fatalf("claim SQL missing started transition guard %q:\n%s", text, sql)
			}
		}
	}
}
