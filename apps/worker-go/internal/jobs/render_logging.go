package jobs

import (
	"strings"

	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/provider"
)

func renderLogAttrs(workerName string, itemID int64, job *provider.JobContext) []any {
	attrs := []any{"item_id", itemID, "worker_name", workerName}
	if job == nil {
		return attrs
	}
	model := strings.TrimSpace(job.ProviderModel)
	if model == "" {
		model = strings.TrimSpace(job.Provider.DefaultModel)
	}
	return append(attrs,
		"job_id", job.ID,
		"provider_name", job.Provider.Name,
		"provider_type", job.Provider.Type,
		"model", model,
		"attempt_count", job.AttemptCount,
		"prompt_length", len(job.Prompt),
	)
}
