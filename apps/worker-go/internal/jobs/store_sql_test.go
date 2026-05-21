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
		"p.type = ANY($5::text[])",
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
		"owner_running_count",
		"ROW_NUMBER() OVER",
		"ORDER BY priority DESC, available_at ASC, id ASC",
		"dead_letter_at IS NULL",
		"owner_queue_rank <= GREATEST($4::int - owner_running_count, 0)",
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

func TestItemCompletionSQLAggregatesParentJob(t *testing.T) {
	required := []string{
		"FROM image_job_items",
		"COUNT(*) FILTER (WHERE status = 'succeeded')",
		"COUNT(*) FILTER (WHERE status = 'failed')",
		"UPDATE image_jobs",
	}
	for _, text := range required {
		if !strings.Contains(AggregateParentJobSQL, text) {
			t.Fatalf("parent aggregate SQL missing %q:\n%s", text, AggregateParentJobSQL)
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
