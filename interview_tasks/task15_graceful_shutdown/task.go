package task15_graceful_shutdown

import (
	"context"
)

// Server processes items from a work channel.
// It must:
// 1. Process items from work channel by calling handler for each item
// 2. Stop when ctx is cancelled
// 3. After ctx is cancelled, finish processing items already received (drain work channel)
// 4. Return total number of items processed
func Server(ctx context.Context, work <-chan string, handler func(string)) int {
	// TODO: implement graceful shutdown — process in-flight work after cancel
	return 0
}
