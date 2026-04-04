package task19_semaphore

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestSemaphore_LimitsConcurrency(t *testing.T) {
	sem := NewSemaphore(3)
	var maxConcurrent atomic.Int64
	var current atomic.Int64
	var wg sync.WaitGroup

	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem.Acquire()
			defer sem.Release()

			c := current.Add(1)
			for {
				old := maxConcurrent.Load()
				if c <= old || maxConcurrent.CompareAndSwap(old, c) {
					break
				}
			}
			time.Sleep(10 * time.Millisecond)
			current.Add(-1)
		}()
	}

	wg.Wait()

	mc := maxConcurrent.Load()
	if mc > 3 {
		t.Fatalf("max concurrent was %d, want <= 3", mc)
	}
	if mc < 2 {
		t.Fatalf("max concurrent was %d, expected at least 2 (check Acquire/Release)", mc)
	}
}

func TestSemaphore_AllComplete(t *testing.T) {
	sem := NewSemaphore(2)
	var count atomic.Int64
	var wg sync.WaitGroup

	for range 50 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem.Acquire()
			count.Add(1)
			sem.Release()
		}()
	}

	wg.Wait()

	if count.Load() != 50 {
		t.Fatalf("expected 50 completions, got %d", count.Load())
	}
}

func TestSemaphore_One(t *testing.T) {
	sem := NewSemaphore(1)
	var maxConcurrent atomic.Int64
	var current atomic.Int64
	var wg sync.WaitGroup

	for range 10 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem.Acquire()
			defer sem.Release()

			c := current.Add(1)
			for {
				old := maxConcurrent.Load()
				if c <= old || maxConcurrent.CompareAndSwap(old, c) {
					break
				}
			}
			time.Sleep(5 * time.Millisecond)
			current.Add(-1)
		}()
	}

	wg.Wait()

	if maxConcurrent.Load() != 1 {
		t.Fatalf("semaphore(1) allowed %d concurrent, want 1", maxConcurrent.Load())
	}
}

func TestSemaphore_AcquireRelease(t *testing.T) {
	sem := NewSemaphore(2)

	sem.Acquire()
	sem.Acquire()

	released := make(chan struct{})
	go func() {
		sem.Acquire()
		close(released)
	}()

	select {
	case <-released:
		t.Fatal("should block when semaphore is full")
	case <-time.After(50 * time.Millisecond):
	}

	sem.Release()

	select {
	case <-released:
	case <-time.After(2 * time.Second):
		t.Fatal("should unblock after release")
	}

	sem.Release()
	sem.Release()
}
