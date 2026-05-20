package jobs

import (
	"strings"
)

const maxFailureMessageLength = 1000

func sanitizeFailureMessage(err error) string {
	if err == nil {
		return "go worker render failed"
	}
	message := strings.TrimSpace(err.Error())
	message = redactBearerToken(message)
	if len(message) <= maxFailureMessageLength {
		return message
	}
	return message[:maxFailureMessageLength]
}

func redactBearerToken(message string) string {
	parts := strings.Fields(message)
	for index, part := range parts {
		if strings.EqualFold(part, "bearer") && index+1 < len(parts) {
			parts[index+1] = "[redacted]"
		}
	}
	if len(parts) == 0 {
		return message
	}
	return strings.Join(parts, " ")
}
