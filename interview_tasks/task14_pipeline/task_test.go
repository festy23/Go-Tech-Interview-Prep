package task14_pipeline

import (
	"testing"
	"time"
)

func TestPipeline_Basic(t *testing.T) {
	in := make(chan int)
	go func() {
		defer close(in)
		for _, v := range []int{1, 2, 3} {
			in <- v
		}
	}()

	double := func(x int) int { return x * 2 }
	addOne := func(x int) int { return x + 1 }

	out := Pipeline(in, double, addOne)

	want := []int{3, 5, 7} // (1*2+1), (2*2+1), (3*2+1)
	i := 0
	for v := range out {
		if i >= len(want) {
			t.Fatalf("too many values from pipeline")
		}
		if v != want[i] {
			t.Fatalf("got %d at index %d, want %d", v, i, want[i])
		}
		i++
	}
	if i != len(want) {
		t.Fatalf("got %d values, want %d", i, len(want))
	}
}

func TestPipeline_SingleStage(t *testing.T) {
	in := make(chan int)
	go func() {
		defer close(in)
		in <- 5
		in <- 10
	}()

	square := func(x int) int { return x * x }
	out := Pipeline(in, square)

	want := []int{25, 100}
	i := 0
	for v := range out {
		if v != want[i] {
			t.Fatalf("got %d, want %d", v, want[i])
		}
		i++
	}
}

func TestPipeline_NoStages(t *testing.T) {
	in := make(chan int)
	go func() {
		defer close(in)
		in <- 42
	}()

	out := Pipeline(in)

	v, ok := <-out
	if !ok || v != 42 {
		t.Fatalf("no stages should pass through, got %d, ok=%v", v, ok)
	}
}

func TestPipeline_EmptyInput(t *testing.T) {
	in := make(chan int)
	go func() { close(in) }()

	double := func(x int) int { return x * 2 }
	out := Pipeline(in, double)

	done := make(chan struct{})
	go func() {
		for range out {
			t.Error("should not receive any values")
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("pipeline did not close on empty input")
	}
}

func TestPipeline_ThreeStages(t *testing.T) {
	in := make(chan int)
	go func() {
		defer close(in)
		in <- 2
		in <- 3
	}()

	add10 := func(x int) int { return x + 10 }
	mul3 := func(x int) int { return x * 3 }
	sub1 := func(x int) int { return x - 1 }

	// (2+10)*3-1=35, (3+10)*3-1=38
	out := Pipeline(in, add10, mul3, sub1)

	want := []int{35, 38}
	i := 0
	for v := range out {
		if v != want[i] {
			t.Fatalf("got %d, want %d", v, want[i])
		}
		i++
	}
}

func TestPipeline_ManyValues(t *testing.T) {
	in := make(chan int)
	go func() {
		defer close(in)
		for i := range 1000 {
			in <- i
		}
	}()

	inc := func(x int) int { return x + 1 }
	out := Pipeline(in, inc)

	count := 0
	for v := range out {
		if v != count+1 {
			t.Fatalf("got %d, want %d", v, count+1)
		}
		count++
	}
	if count != 1000 {
		t.Fatalf("got %d values, want 1000", count)
	}
}
