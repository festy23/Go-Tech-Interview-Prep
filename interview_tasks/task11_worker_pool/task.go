package task11_worker_pool

// WorkerPool executes jobs concurrently using numWorkers goroutines.
// Each job is a function that returns a result string.
// Returns a slice of results (order may differ from input order).
// All jobs must be executed exactly once.
func WorkerPool(numWorkers int, jobs []func() string) []string {
	// TODO: implement worker pool with channels
	return nil
}
