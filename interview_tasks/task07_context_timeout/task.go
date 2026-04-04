package task07_context_timeout

import (
	"context"
	"time"
)

// RunWithTimeout runs fn and returns its result or context deadline exceeded.
func RunWithTimeout(timeout time.Duration, fn func() (string, error)) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	_ = ctx
	// TODO: implement with goroutine + select
	return "", nil
}
