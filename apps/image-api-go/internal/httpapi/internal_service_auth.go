package httpapi

import (
	"crypto/sha256"
	"crypto/subtle"
	"net/http"
	"strings"
)

const internalServiceTokenHeader = "X-Internal-Service-Token"

func (h Handler) requireInternalServiceToken(w http.ResponseWriter, r *http.Request) bool {
	tokens := configuredInternalServiceTokens(h.config)
	if len(tokens) == 0 {
		http.Error(w, "internal service token not configured", http.StatusForbidden)
		return false
	}
	provided := r.Header.Get(internalServiceTokenHeader)
	if strings.TrimSpace(provided) == "" {
		http.Error(w, "internal service token required", http.StatusUnauthorized)
		return false
	}
	if !internalServiceTokenMatches(provided, tokens) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return false
	}
	return true
}

func configuredInternalServiceTokens(config Config) []string {
	tokens := make([]string, 0, 2)
	if strings.TrimSpace(config.InternalServiceToken) != "" {
		tokens = append(tokens, config.InternalServiceToken)
	}
	if strings.TrimSpace(config.InternalServiceTokenNext) != "" {
		tokens = append(tokens, config.InternalServiceTokenNext)
	}
	return tokens
}

func internalServiceTokenMatches(provided string, tokens []string) bool {
	providedHash := sha256.Sum256([]byte(provided))
	matched := 0
	for _, token := range tokens {
		tokenHash := sha256.Sum256([]byte(token))
		matched |= subtle.ConstantTimeCompare(providedHash[:], tokenHash[:])
	}
	return matched == 1
}
