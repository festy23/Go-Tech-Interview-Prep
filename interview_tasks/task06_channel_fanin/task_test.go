package task06_channel_fanin

import (
	"sort"
	"testing"
	"time"
)

func TestFanIn(t *testing.T) {
	a := make(chan int)
	b := make(chan int)

	go func() {
		defer close(a)
		a <- 1
		a <- 3
	}()
	go func() {
		defer close(b)
		b <- 2
		b <- 4
	}()

	out := FanIn(a, b)
	var got []int
	for v := range out {
		got = append(got, v)
	}

	sort.Ints(got)
	want := []int{1, 2, 3, 4}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

func TestFanIn_OneEmpty(t *testing.T) {
	a := make(chan int)
	b := make(chan int)

	go func() {
		defer close(a)
		a <- 10
		a <- 20
		a <- 30
	}()
	go func() {
		close(b)
	}()

	out := FanIn(a, b)
	var got []int
	for v := range out {
		got = append(got, v)
	}

	sort.Ints(got)
	want := []int{10, 20, 30}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

func TestFanIn_BothEmpty(t *testing.T) {
	a := make(chan int)
	b := make(chan int)

	go func() { close(a) }()
	go func() { close(b) }()

	out := FanIn(a, b)
	var got []int
	for v := range out {
		got = append(got, v)
	}

	if len(got) != 0 {
		t.Fatalf("expected empty output, got %v", got)
	}
}

func TestFanIn_ManyValues(t *testing.T) {
	a := make(chan int)
	b := make(chan int)

	go func() {
		defer close(a)
		for i := 0; i < 100; i++ {
			a <- i * 2
		}
	}()
	go func() {
		defer close(b)
		for i := 0; i < 100; i++ {
			b <- i*2 + 1
		}
	}()

	out := FanIn(a, b)
	var got []int
	for v := range out {
		got = append(got, v)
	}

	if len(got) != 200 {
		t.Fatalf("expected 200 values, got %d", len(got))
	}

	sort.Ints(got)
	for i := 0; i < 200; i++ {
		if got[i] != i {
			t.Fatalf("got[%d]=%d, want %d", i, got[i], i)
		}
	}
}

func TestFanIn_ClosesOutput(t *testing.T) {
	a := make(chan int)
	b := make(chan int)

	go func() { close(a) }()
	go func() { close(b) }()

	out := FanIn(a, b)

	done := make(chan struct{})
	go func() {
		for range out {
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("output channel was not closed after both inputs closed")
	}
}
