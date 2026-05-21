package imagejob

const (
	RetryErrorCode          = "image_job_retry_scheduled"
	TerminalErrorCode       = "image_job_failed"
	DefaultRetryBaseSeconds = 5
	DefaultRetryMaxSeconds  = 300
	backoffMultiplier       = 2
)

func RetryBackoffSeconds(attemptCount int, baseSeconds int, maxSeconds int) int {
	base := normalizedRetryBase(baseSeconds)
	maxDelay := normalizedRetryMax(maxSeconds)
	delay := base
	if delay > maxDelay {
		return maxDelay
	}
	for attempt := 1; attempt < attemptCount && delay < maxDelay; attempt++ {
		delay *= backoffMultiplier
		if delay > maxDelay {
			return maxDelay
		}
	}
	return delay
}

func normalizedRetryBase(baseSeconds int) int {
	if baseSeconds < 1 {
		return DefaultRetryBaseSeconds
	}
	return baseSeconds
}

func normalizedRetryMax(maxSeconds int) int {
	if maxSeconds < 1 {
		return DefaultRetryMaxSeconds
	}
	return maxSeconds
}
