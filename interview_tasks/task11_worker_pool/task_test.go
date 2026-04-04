package task11_worker_pool

import (
	"fmt"
	"sort"
	"sync/atomic"
	"testing"
	"time"
)

func TestWorkerPool_Basic(t *testing.T) {
	jobs := []func() string{
		func() string { return "a" },
		func() string { return "b" },
		func() string { return "c" },
	}

	got := WorkerPool(2, jobs)
	sort.Strings(got)
	want := []string{"a", "b", "c"}

	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

func TestWorkerPool_AllJobsExecuted(t *testing.T) {
	var count atomic.Int64
	n := 50
	jobs := make([]func() string, n)
	for i := range n {
		i := i
		jobs[i] = func() string {
			count.Add(1)
			return fmt.Sprintf("job-%d", i)
		}
	}

	results := WorkerPool(5, jobs)
	if int(count.Load()) != n {
		t.Fatalf("expected %d jobs executed, got %d", n, count.Load())
	}
	if len(results) != n {
		t.Fatalf("expected %d results, got %d", n, len(results))
	}
}

func TestWorkerPool_Concurrency(t *testing.T) {
	var maxConcurrent atomic.Int64
	var current atomic.Int64

	jobs := make([]func() string, 20)
	for i := range 20 {
		jobs[i] = func() string {
			c := current.Add(1)
			for {
				old := maxConcurrent.Load()
				if c <= old || maxConcurrent.CompareAndSwap(old, c) {
					break
				}
			}
			time.Sleep(10 * time.Millisecond)
			current.Add(-1)
			return "done"
		}
	}

	WorkerPool(4, jobs)

	mc := maxConcurrent.Load()
	if mc < 2 {
		t.Fatalf("expected concurrent execution, max concurrent was %d", mc)
	}
	if mc > 4 {
		t.Fatalf("exceeded worker limit, max concurrent was %d", mc)
	}
}

func TestWorkerPool_EmptyJobs(t *testing.T) {
	got := WorkerPool(3, nil)
	if len(got) != 0 {
		t.Fatalf("expected empty results for nil jobs, got %v", got)
	}
}

func TestWorkerPool_SingleWorker(t *testing.T) {
	jobs := []func() string{
		func() string { return "x" },
		func() string { return "y" },
	}

	got := WorkerPool(1, jobs)
	sort.Strings(got)
	if len(got) != 2 || got[0] != "x" || got[1] != "y" {
		t.Fatalf("got %v, want [x y]", got)
	}
}

func TestWorkerPool_MoreWorkersThanJobs(t *testing.T) {
	jobs := []func() string{
		func() string { return "only" },
	}
	got := WorkerPool(10, jobs)
	if len(got) != 1 || got[0] != "only" {
		t.Fatalf("got %v, want [only]", got)
	}
}
