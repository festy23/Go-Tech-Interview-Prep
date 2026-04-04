package task09_retry

import "time"

// Retry executes fn up to attempts times with delay between retries.
// Stop early on success.
func Retry(attempts int, delay time.Duration, fn func() error) error {
	// TODO: implement retry logic
	return nil
}
