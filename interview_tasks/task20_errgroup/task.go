package task20_errgroup

import "context"

// Result holds a URL fetch result.
type Result struct {
	URL  string
	Data string
}

// FetchAll calls fetcher for each URL concurrently.
// If any fetcher returns an error, cancel all remaining work and return that error.
// On success, return all results (order does not matter).
// Use context for cancellation propagation.
//
// Hint: implement manually with goroutines + context (do NOT use golang.org/x/sync/errgroup).
func FetchAll(ctx context.Context, urls []string, fetcher func(ctx context.Context, url string) (string, error)) ([]Result, error) {
	// TODO: implement concurrent fetch with error cancellation
	return nil, nil
}
