package task15_graceful_shutdown

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

func TestServer_ProcessesAllBeforeCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())

	work := make(chan string, 5)
	work <- "a"
	work <- "b"
	work <- "c"
	close(work)

	var processed atomic.Int64
	handler := func(s string) {
		processed.Add(1)
	}

	count := Server(ctx, work, handler)
	cancel()

	if count != 3 {
		t.Fatalf("expected 3 items processed, got %d", count)
	}
	if processed.Load() != 3 {
		t.Fatalf("handler called %d times, want 3", processed.Load())
	}
}

func TestServer_StopsOnCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())

	work := make(chan string)
	var processed atomic.Int64
	handler := func(s string) {
		processed.Add(1)
	}

	done := make(chan int)
	go func() {
		done <- Server(ctx, work, handler)
	}()

	work <- "item1"
	work <- "item2"
	time.Sleep(20 * time.Millisecond)
	cancel()

	select {
	case count := <-done:
		if count < 2 {
			t.Fatalf("expected at least 2 items processed, got %d", count)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Server did not stop after context cancel")
	}
}

func TestServer_DrainsAfterCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())

	work := make(chan string, 10)
	for i := range 10 {
		work <- string(rune('a' + i))
	}
	close(work)

	cancel() // cancel before server starts

	var processed atomic.Int64
	handler := func(s string) {
		processed.Add(1)
	}

	count := Server(ctx, work, handler)

	if count != 10 {
		t.Fatalf("expected 10 items drained, got %d", count)
	}
}

func TestServer_EmptyChannel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	work := make(chan string)
	close(work)

	handler := func(s string) {
		t.Fatal("handler should not be called on empty channel")
	}

	count := Server(ctx, work, handler)
	cancel()

	if count != 0 {
		t.Fatalf("expected 0, got %d", count)
	}
}
