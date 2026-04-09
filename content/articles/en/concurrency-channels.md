---
title: Channels
blockId: concurrency-channels
parentBlockId: concurrency
---

# Channels in Go

## Introduction

Channels are the primary communication mechanism between goroutines in Go. The philosophy is captured in Rob Pike's famous quote:

> *"Don't communicate by sharing memory; share memory by communicating."*

Instead of using mutexes and shared variables, goroutines pass data directly through channels. This eliminates an entire class of bugs: data races, forgotten locks, and deadlocks caused by inconsistent lock acquisition order.

A channel is a typed conduit: `chan T` can only carry values of type `T`. Channels are created with `make`.

---

## Unbuffered Channels

```go
ch := make(chan int) // unbuffered int channel
```

An unbuffered channel is a **synchronous** rendezvous point:

- The sender (`ch <- val`) **blocks** until a receiver is ready to read.
- The receiver (`val := <-ch`) **blocks** until the sender sends a value.

Both sides must be ready simultaneously — like a hand-to-hand pass: both parties must be present.

```go
package main

import (
    "fmt"
    "time"
)

func main() {
    ch := make(chan string)

    go func() {
        time.Sleep(500 * time.Millisecond) // simulate work
        ch <- "result"                     // blocks until main reads
        fmt.Println("goroutine: value sent")
    }()

    fmt.Println("main: waiting...")
    msg := <-ch // blocks until goroutine sends
    fmt.Println("main: received:", msg)
}
```

**Happens-before guarantee.** Everything the sender goroutine did *before* `ch <- val` is guaranteed to be visible to the receiver *after* `val := <-ch`. A channel is a memory synchronization point.

**Signal channel.** The idiomatic way to signal completion is a `chan struct{}` channel (zero size, no allocation):

```go
done := make(chan struct{})
go func() {
    doWork()
    close(done) // signal: work is complete
}()
<-done // wait for signal
```

---

## Buffered Channels

```go
ch := make(chan int, 5) // buffer of 5 elements
```

A buffered channel acts as a fixed-size FIFO queue:

- Send **does not block** while there is room in the buffer.
- Send **blocks** when the buffer is full.
- Receive **does not block** while there is data in the buffer.
- Receive **blocks** when the buffer is empty.

```go
package main

import "fmt"

func main() {
    ch := make(chan string, 3)

    // All three sends are non-blocking — buffer holds 3
    ch <- "first"
    ch <- "second"
    ch <- "third"

    fmt.Printf("len=%d, cap=%d\n", len(ch), cap(ch)) // len=3, cap=3

    // Read in FIFO order
    fmt.Println(<-ch) // "first"
    fmt.Println(<-ch) // "second"
    fmt.Println(<-ch) // "third"
}
```

**When to use a buffered channel:**

- Producer and consumer operate at different speeds (smoothing load spikes).
- Implementing a semaphore (see below).
- Sending exactly N values from a single goroutine without blocking (buffer ≥ N).

**When not to use:** don't add a buffer "just in case" — it masks logical errors. Start with unbuffered channels.

---

## select: Channel Multiplexing

`select` is like `switch`, but for channel operations. It waits until at least one `case` is ready and executes it.

```go
select {
case msg := <-ch1:
    fmt.Println("from ch1:", msg)
case msg := <-ch2:
    fmt.Println("from ch2:", msg)
}
```

Key properties:

1. If multiple `case`s are ready — a **random** one is chosen (not the first). This prevents channel starvation.
2. If none are ready — `select` blocks.
3. `default` — executes immediately if no `case` is ready (non-blocking `select`).

### Pattern: timeout

```go
import "time"

select {
case result := <-workCh:
    fmt.Println("result:", result)
case <-time.After(2 * time.Second):
    fmt.Println("timeout: took too long")
}
```

### Pattern: non-blocking receive

```go
select {
case val := <-ch:
    fmt.Println("received:", val)
default:
    fmt.Println("channel empty, not blocking")
}
```

### Pattern: cancellation via context

```go
select {
case data := <-dataCh:
    process(data)
case <-ctx.Done():
    return ctx.Err()
}
```

### Pattern: disabling a case with a nil channel

Assigning `nil` to a channel in a `select` permanently "freezes" its `case` — it will never be selected:

```go
func merge(a, b <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for a != nil || b != nil {
            select {
            case v, ok := <-a:
                if !ok { a = nil; continue } // disable closed channel
                out <- v
            case v, ok := <-b:
                if !ok { b = nil; continue }
                out <- v
            }
        }
    }()
    return out
}
```

---

## Pipeline: Chaining Processing Stages

A pipeline is a chain of stages connected by channels. Each stage:
1. Reads from an input channel.
2. Processes the data.
3. Writes to an output channel.

Each stage runs in its own goroutine, giving stage-level parallelism (like an assembly line).

```go
package main

import (
    "context"
    "fmt"
)

// generate — data source: sends numbers into a channel.
func generate(ctx context.Context, nums ...int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for _, n := range nums {
            select {
            case <-ctx.Done():
                return
            case out <- n:
            }
        }
    }()
    return out
}

// square — transformation: squares each number.
func square(ctx context.Context, in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for n := range in {
            select {
            case <-ctx.Done():
                return
            case out <- n * n:
            }
        }
    }()
    return out
}

// filter — filtering: passes only even numbers.
func filter(ctx context.Context, in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for n := range in {
            if n%2 != 0 {
                continue
            }
            select {
            case <-ctx.Done():
                return
            case out <- n:
            }
        }
    }()
    return out
}

func main() {
    ctx := context.Background()

    // Build the pipeline: generate → square → filter
    nums := generate(ctx, 1, 2, 3, 4, 5, 6)
    squares := square(ctx, nums)
    evens := filter(ctx, squares)

    // Read the final output
    for v := range evens {
        fmt.Println(v) // 4, 16, 36
    }
}
```

**Rules for correct pipeline shutdown:**
- Each stage closes its output channel with `defer close(out)`.
- Channel closure propagates: closing input → stage finishes `range` → closes its output.
- Use `context.Context` for early cancellation.

---

## Fan-out / Fan-in

**Fan-out** — multiple goroutines read from one task channel. Go guarantees: each value is received by exactly one goroutine.

**Fan-in** — multiple result channels are merged into one output channel.

Together they form a pattern: parallelize processing → collect results.

```go
package main

import (
    "context"
    "fmt"
    "sync"
    "time"
)

// worker — one Fan-out worker: reads jobs from a shared channel, writes results.
func worker(ctx context.Context, id int, jobs <-chan int, results chan<- int) {
    for job := range jobs {
        select {
        case <-ctx.Done():
            return
        default:
        }
        time.Sleep(10 * time.Millisecond) // simulate processing
        results <- job * job
        fmt.Printf("worker %d: %d² = %d\n", id, job, job*job)
    }
}

// fanOut launches n workers that all read from the same jobs channel.
func fanOut(ctx context.Context, jobs <-chan int, n int) <-chan int {
    results := make(chan int, n)
    var wg sync.WaitGroup

    for i := range n { // Go 1.22+: for i := range n
        wg.Add(1)
        go func() {
            defer wg.Done()
            worker(ctx, i+1, jobs, results)
        }()
    }

    // Close results when all workers are done
    go func() {
        wg.Wait()
        close(results)
    }()

    return results
}

func main() {
    ctx := context.Background()

    // Fill the jobs channel
    jobs := make(chan int, 10)
    for i := range 10 {
        jobs <- i + 1
    }
    close(jobs)

    // Fan-out: 3 workers process jobs in parallel
    results := fanOut(ctx, jobs, 3)

    // Fan-in: collect all results
    total := 0
    for r := range results {
        total += r
    }
    fmt.Println("Sum of squares:", total)
}
```

### Fan-out with errgroup (Go 1.25)

In Go 1.25, `errgroup.Group` supports the `wg.Go()` method that launches a goroutine and aggregates the first error:

```go
package main

import (
    "context"
    "fmt"
    "net/http"

    "golang.org/x/sync/errgroup"
)

func main() {
    ctx := context.Background()
    urls := []string{
        "https://go.dev",
        "https://pkg.go.dev",
        "https://blog.golang.org",
    }

    g, ctx := errgroup.WithContext(ctx)
    results := make(chan int, len(urls))

    for _, url := range urls {
        url := url
        g.Go(func() error { // wg.Go() — launch goroutine with error handling
            resp, err := http.Get(url)
            if err != nil {
                return err
            }
            defer resp.Body.Close()
            results <- resp.StatusCode
            return nil
        })
    }

    // Wait for all goroutines and close the results channel
    go func() {
        g.Wait()
        close(results)
    }()

    for code := range results {
        fmt.Println("status:", code)
    }

    if err := g.Wait(); err != nil {
        fmt.Println("error:", err)
    }
}
```

---

## Semaphore via Buffered Channel

A semaphore limits the number of **concurrently** executing operations. In Go it is implemented via a buffered channel of capacity N:

- **Acquire:** `sem <- struct{}{}` — occupy a slot. Blocks if the buffer is full (N operations are already active).
- **Release:** `<-sem` — free a slot.

```go
package main

import (
    "context"
    "fmt"
    "sync"
    "time"
)

type semaphore chan struct{}

func newSemaphore(n int) semaphore {
    return make(semaphore, n)
}

func (s semaphore) acquire() { s <- struct{}{} }
func (s semaphore) release() { <-s }

func fetchURL(ctx context.Context, sem semaphore, wg *sync.WaitGroup, id int) {
    defer wg.Done()

    sem.acquire()       // occupy a slot
    defer sem.release() // release slot on exit

    fmt.Printf("  [%d] request started (at most 3 concurrent)\n", id)
    select {
    case <-ctx.Done():
        return
    case <-time.After(100 * time.Millisecond):
    }
    fmt.Printf("  [%d] request done\n", id)
}

func main() {
    ctx := context.Background()
    sem := newSemaphore(3) // at most 3 concurrent operations
    var wg sync.WaitGroup

    for i := range 10 {
        wg.Add(1)
        go fetchURL(ctx, sem, &wg, i+1)
    }

    wg.Wait()
    fmt.Println("All requests completed.")
}
```

**Semaphore vs Worker Pool:**

| | Semaphore | Worker Pool |
|---|---|---|
| Goroutine creation | Dynamic (per task) | Fixed set |
| Best when | Each task is unique (closures) | Homogeneous tasks via a channel |
| Overhead | Higher (N goroutines created) | Lower (goroutines are reused) |

For production use, consider `golang.org/x/sync/semaphore` — a weighted semaphore from the Go extended standard library.

---

## Closing Channels

```go
close(ch) // signal: no more values will be sent
```

**Rules for closing:**

1. Only the **sender** should close a channel, never the receiver.
2. Closing an already-closed channel → `panic: close of closed channel`.
3. Closing a `nil` channel → `panic: close of nil channel`.
4. Sending to a closed channel → `panic: send on closed channel`.

**Reading from a closed channel** does not panic — it is safe:

```go
ch := make(chan int, 3)
ch <- 10
ch <- 20
close(ch)

// Buffered values are read normally:
v1, ok := <-ch // v1=10, ok=true
v2, ok := <-ch // v2=20, ok=true
v3, ok := <-ch // v3=0,  ok=false (channel closed and empty)
```

**Idiomatic iteration** — `for range` over a channel:

```go
// Automatically terminates when the channel is closed
for val := range ch {
    process(val)
}
// Warning: without close(ch), range blocks forever → deadlock
```

**Broadcast via close.** `close(ch)` instantly unblocks **all** waiting receivers:

```go
quit := make(chan struct{})

for i := range 5 {
    go func() {
        <-quit // all 5 goroutines are waiting
        fmt.Printf("goroutine %d: received stop signal\n", i)
    }()
}

close(quit) // all 5 goroutines unblock simultaneously
```

---

## Common Mistakes

### 1. Deadlock

Occurs when all goroutines are blocked waiting for each other:

```go
// BAD: nobody reads from the channel
ch := make(chan int)
ch <- 42 // blocks forever → fatal error: all goroutines are asleep
```

**Fix:** ensure that for every send there is a receiver (in another goroutine or via a buffer).

### 2. Send on closed channel

```go
ch := make(chan int, 1)
close(ch)
ch <- 1 // panic: send on closed channel
```

**Protection pattern** for multiple senders — use `sync.Once` for closing:

```go
var once sync.Once
safeClose := func() { once.Do(func() { close(ch) }) }
```

### 3. Nil channel: permanent block

```go
var ch chan int // ch == nil
ch <- 1        // blocks forever
<-ch           // blocks forever
```

A `nil` channel in `select` is ignored (its `case` is never selected) — this is a useful property for dynamically disabling `case`s.

### 4. Goroutine leak via unclosed channel

```go
func producer() <-chan int {
    ch := make(chan int)
    go func() {
        for i := range 100 {
            ch <- i // if the receiver is gone — goroutine hangs forever
        }
        // close(ch) forgotten!
    }()
    return ch
}
```

**Fix:** always close channels (`defer close(ch)`) or use `context.Context` for a cancellation signal.

### 5. Closing race: multiple senders

With multiple sender goroutines you cannot simply call `close(ch)` — others may still be sending. The idiomatic solution: use `sync.WaitGroup` and close the channel only after **all** senders have finished:

```go
var wg sync.WaitGroup
ch := make(chan int)

for i := range 5 {
    wg.Add(1)
    go func() {
        defer wg.Done()
        ch <- i
    }()
}

go func() {
    wg.Wait()
    close(ch) // safe: all senders have finished
}()

for v := range ch {
    fmt.Println(v)
}
```

---

## Self-check Questions

1. What is the difference between an unbuffered and a buffered channel? What guarantee does an unbuffered channel provide?
2. What happens if `select` has no `default` and none of its `case`s are ready?
3. Why does `select` choose a random `case` when multiple are ready, rather than the first?
4. How do you implement an operation timeout using a channel?
5. What is the difference between the Fan-out pattern and a Worker Pool?
6. Explain the semaphore implementation via a buffered channel. What happens during `acquire` when the buffer is full?
7. Who should close a channel — the sender or the receiver? Why?
8. What does `v, ok := <-ch` return when the channel is closed and the buffer is empty?
9. How does a `nil` channel behave in `select`? What is this used for?
10. What is a "goroutine leak" in the context of channels and how do you prevent it?
