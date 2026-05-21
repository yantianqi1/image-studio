package imagejob

import "testing"

func TestRetryBackoffSecondsUsesAttemptCountAndCap(t *testing.T) {
	cases := []struct {
		name         string
		attemptCount int
		baseSeconds  int
		maxSeconds   int
		want         int
	}{
		{name: "first retry", attemptCount: 1, baseSeconds: 5, maxSeconds: 300, want: 5},
		{name: "third retry", attemptCount: 3, baseSeconds: 5, maxSeconds: 300, want: 20},
		{name: "capped", attemptCount: 8, baseSeconds: 5, maxSeconds: 300, want: 300},
		{name: "defaults", attemptCount: 2, baseSeconds: 0, maxSeconds: 0, want: 10},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := RetryBackoffSeconds(tc.attemptCount, tc.baseSeconds, tc.maxSeconds)

			if got != tc.want {
				t.Fatalf("got %d, want %d", got, tc.want)
			}
		})
	}
}

func TestFailureErrorCodesAreStable(t *testing.T) {
	if RetryErrorCode != "image_job_retry_scheduled" {
		t.Fatalf("retry code changed: %s", RetryErrorCode)
	}
	if TerminalErrorCode != "image_job_failed" {
		t.Fatalf("terminal code changed: %s", TerminalErrorCode)
	}
}
