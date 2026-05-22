package jobs

import (
	"strings"
	"testing"
)

func TestClaimSQLQualifiesParentIDInStartedJobEvent(t *testing.T) {
	for _, sql := range []string{ClaimQueuedSQL, ClaimQueuedRenderSQL} {
		if strings.Contains(sql, "SELECT id, NULL, 'image_job.started'") {
			t.Fatalf("claim SQL uses ambiguous parent id in started event:\n%s", sql)
		}
		if !strings.Contains(sql, "SELECT parents.id, NULL, 'image_job.started'") {
			t.Fatalf("claim SQL does not qualify parent id in started event:\n%s", sql)
		}
	}
}
