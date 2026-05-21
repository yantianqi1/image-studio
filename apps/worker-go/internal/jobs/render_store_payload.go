package jobs

import (
	"encoding/json"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/provider"
)

type rawJobContext struct {
	conversationMessages pgtype.Text
	clientProviderConfig pgtype.Text
}

func applyRawJSON(job *provider.JobContext, raw rawJobContext) error {
	if raw.conversationMessages.Valid && raw.conversationMessages.String != "null" {
		if err := json.Unmarshal([]byte(raw.conversationMessages.String), &job.ConversationMessages); err != nil {
			return provider.WrapError("conversation_messages_invalid", "conversation messages invalid", true, err)
		}
	}
	if raw.clientProviderConfig.Valid && raw.clientProviderConfig.String != "null" {
		job.ClientProviderConfigRaw = raw.clientProviderConfig.String
	}
	return nil
}

func uniqueIDs(ids []int64) []int64 {
	seen := map[int64]bool{}
	result := make([]int64, 0, len(ids))
	for _, id := range ids {
		if id == 0 || seen[id] {
			continue
		}
		seen[id] = true
		result = append(result, id)
	}
	return result
}
