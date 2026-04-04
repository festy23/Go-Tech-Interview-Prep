package task19_semaphore

// Semaphore limits concurrency to at most maxConcurrent goroutines.
// Implement using a buffered channel.
type Semaphore struct {
	// TODO: implement
}

// NewSemaphore creates a semaphore that allows maxConcurrent simultaneous operations.
func NewSemaphore(maxConcurrent int) *Semaphore {
	// TODO: implement
	return &Semaphore{}
}

// Acquire blocks until a slot is available.
func (s *Semaphore) Acquire() {
	// TODO: implement
}

// Release frees a slot.
func (s *Semaphore) Release() {
	// TODO: implement
}
