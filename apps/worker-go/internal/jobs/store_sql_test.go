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
		"available_at=now()",
		"error_code=$3",
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
		"p.type = ANY($4::text[])",
		"j.client_provider_config IS NULL",
	}
	for _, text := range required {
		if !strings.Contains(ClaimQueuedRenderSQL, text) {
			t.Fatalf("render claim SQL missing %q:\n%s", text, ClaimQueuedRenderSQL)
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
