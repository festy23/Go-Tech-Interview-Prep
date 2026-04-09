---
title: Goroutines
blockId: concurrency-goroutines
parentBlockId: concurrency
---

## Introduction

A goroutine is a lightweight unit of concurrent execution managed by the Go runtime — **not** by the operating system. Starting one is as simple as writing `go f()` before any function call.

Key differences between a goroutine and an OS thread:

| Property | Goroutine | OS Thread |
|---|---|---|
| Initial stack | ~2–8 KB, grows dynamically | ~1–8 MB, fixed |
| Managed by | Go runtime (user space) | OS kernel |
| Context switch | Cheap, no syscall | Expensive, syscall |
| Practical limit | Hundreds of thousands | Thousands |

In practice this means you can fearlessly create 100 000 goroutines — each costs only a few kilobytes and will never block an OS thread while waiting.

---

## The GMP Model

Go's scheduler implements the **GMP** model: three entities that cooperate to multiplex goroutines onto OS threads (an **M:N** model).

### G — Goroutine

The `runtime.g` struct stores everything about a goroutine: its stack, program counter, and status (`runnable`, `running`, `waiting`, …). The stack starts at 2–8 KB and grows segmented as needed, up to 1 GB (configurable via `runtime/debug.SetMaxStack`).

### M — Machine (OS thread)

An `M` is a real OS thread created by the runtime via `clone(2)` on Linux. An `M` executes goroutines and may block on system calls. When an `M` blocks, the runtime spins up a new `M` to keep other `P`s busy.

### P — Processor (logical processor)

A `P` is a scheduler resource: it binds `G`s to `M`s and owns a **local run queue** (LRQ, up to 256 goroutines). The number of `P`s equals `GOMAXPROCS` (defaults to the number of logical CPU cores).

The global run queue (GRQ) is used when an LRQ overflows or when a goroutine returns from a syscall and no local `P` is immediately available.

```
 ┌────────────┐   ┌────────────┐
 │    P 0     │   │    P 1     │
 │ LRQ: G,G,G │   │ LRQ: G,G  │
 └─────┬──────┘   └─────┬──────┘
       │                │
       M0               M1
       │                │
    OS Thread        OS Thread
```

**Goroutine lifecycle:**
1. `go f()` creates a `G` and places it in the current `P`'s LRQ (or the GRQ if the LRQ is full).
2. The `P` dequeues a `G` from its LRQ and hands it to the `M` for execution.
3. If the `G` makes a blocking syscall, the `M` detaches from the `P`; the `P` continues with another `M`.
4. Once the syscall returns, the goroutine is placed in the LRQ of the nearest free `P`.

```go
package main

import (
    "fmt"
    "runtime"
)

func main() {
    fmt.Printf("GOMAXPROCS   = %d\n", runtime.GOMAXPROCS(0))
    fmt.Printf("NumCPU       = %d\n", runtime.NumCPU())
    fmt.Printf("NumGoroutine = %d\n", runtime.NumGoroutine())
}
```

---

## Work Stealing

What happens when one `P` drains its LRQ while another is overloaded? The Go scheduler uses **work stealing**.

### The Algorithm

1. **Check own LRQ.** If empty, go to step 2.
2. **Check the GRQ.** If there are tasks, grab a batch.
3. **Steal from another `P`.** Pick a random `P` and take **half** of its LRQ.
4. If nothing is found anywhere, the `M` enters a spinning-then-sleeping idle state.

```
P0 (empty) ──steal 50%──> P1 (LRQ: G0,G1,G2,G3)
                                      │
                           P1 gives up: G2, G3
```

Work stealing guarantees that no `P` sits idle while others have work. This is critical for the throughput of worker pools and pipelines.

### Local Run Queue vs Global Run Queue

- **LRQ** is operated lock-free — a `P` owns it exclusively.
- **GRQ** is protected by a mutex — access is more expensive, so it acts as a second-level buffer.
- Every ~61 scheduler ticks, the scheduler polls the GRQ to prevent starvation of goroutines that landed there (e.g., after a syscall).

---

## Preemptive Scheduling

### Cooperative vs Preemptive Multitasking

In early Go versions (before 1.14) the scheduler was **cooperative**: a goroutine could yield the CPU only at cooperation points — function calls, channel operations, `time.Sleep`, and syscalls. A "hot" goroutine with no function calls could monopolise an OS thread and starve all others on the same `P`.

### Asynchronous Preemption (Go 1.14+)

Since Go 1.14, the scheduler supports **asynchronous preemption** via the `SIGURG` signal:

1. The monitor goroutine (`sysmon`) scans for goroutines that have been running for more than 10 ms.
2. If it finds one, the runtime sends `SIGURG` to the `M` executing it.
3. The signal handler injects a preemption frame onto the goroutine's stack and returns control to the scheduler.
4. The goroutine is rescheduled later.

This enables correct preemption even of goroutines running tight loops with no function calls:

```go
package main

import (
    "fmt"
    "runtime"
    "time"
)

// Before Go 1.14, this loop could block the thread forever.
// With Go 1.14+, sysmon preempts the goroutine within ~10 ms.
func busyLoop(id int, done chan struct{}) {
    for {
        select {
        case <-done:
            return
        default:
            // Infinite computation — no function calls
            _ = id * id
        }
    }
}

func main() {
    runtime.GOMAXPROCS(1) // single thread — makes preemption visible

    done := make(chan struct{})
    go busyLoop(42, done)

    time.Sleep(50 * time.Millisecond)
    fmt.Println("main: still running — scheduler preempted busyLoop")
    close(done)
}
```

### Preemption Points Summary

| Mechanism | Version | Description |
|---|---|---|
| Function call preamble | all | Function prologue checks a preempt flag |
| Async signal | ≥1.14 | `SIGURG` can preempt any goroutine |
| Syscall | all | `M` detaches from `P` automatically |

---

## Creating Goroutines

### `go func()` — basic syntax

```go
package main

import (
    "fmt"
    "sync"
)

func main() {
    var wg sync.WaitGroup

    // Named function
    wg.Add(1)
    go sayHello(&wg, "world")

    // Anonymous closure
    msg := "goroutine"
    wg.Add(1)
    go func() {
        defer wg.Done()
        fmt.Println("Hello from", msg)
    }()

    // Go 1.22+: loop variable is safe — each iteration gets its own copy of i
    for i := range 5 {
        wg.Add(1)
        go func() {
            defer wg.Done()
            fmt.Printf("iteration %d\n", i)
        }()
    }

    wg.Wait()
}

func sayHello(wg *sync.WaitGroup, name string) {
    defer wg.Done()
    fmt.Println("Hello,", name)
}
```

### `errgroup.Group.Go()` — Go 1.25 / golang.org/x/sync

The `golang.org/x/sync/errgroup` package provides a more ergonomic API: `g.Go()` accepts `func() error` and `g.Wait()` returns the first non-nil error.

```go
package main

import (
    "fmt"
    "net/http"

    "golang.org/x/sync/errgroup"
)

func main() {
    var g errgroup.Group

    urls := []string{
        "https://go.dev",
        "https://pkg.go.dev",
        "https://github.com/golang/go",
    }

    for _, url := range urls {
        g.Go(func() error {
            resp, err := http.Get(url) //nolint:noctx
            if err != nil {
                return fmt.Errorf("GET %s: %w", url, err)
            }
            defer resp.Body.Close()
            fmt.Printf("%s → %d\n", url, resp.StatusCode)
            return nil
        })
    }

    if err := g.Wait(); err != nil {
        fmt.Println("error:", err)
    }
}
```

`SetLimit(n)` caps concurrency — handy as an inline semaphore:

```go
var g errgroup.Group
g.SetLimit(4) // at most 4 goroutines running at once

for i := range 20 {
    g.Go(func() error {
        processItem(i)
        return nil
    })
}
_ = g.Wait()
```

---

## Common Mistakes

### 1. Goroutine Leak — a goroutine that never terminates

The most common pitfall: a goroutine blocks waiting on a channel that nobody will ever close.

```go
// BAD: goroutine hangs forever if nobody sends to ch
func leak() {
    ch := make(chan int)
    go func() {
        val := <-ch // blocked forever
        fmt.Println(val)
    }()
    // ch is never closed → leak
}

// GOOD: context lets the goroutine exit cleanly
func noLeak(ctx context.Context) {
    ch := make(chan int, 1)
    go func() {
        select {
        case val := <-ch:
            fmt.Println(val)
        case <-ctx.Done():
            return // clean exit
        }
    }()
}
```

To detect leaks in tests, use `runtime.NumGoroutine()` assertions or the `goleak` package:

```go
func TestNoLeak(t *testing.T) {
    defer goleak.VerifyNone(t)
    // ... your test code
}
```

### 2. Race Condition — concurrent unsynchronised access

Multiple goroutines reading and writing the same variable without synchronisation:

```go
// BAD: data race — counter is read and written concurrently
var counter int
var wg sync.WaitGroup
for range 1000 {
    wg.Add(1)
    go func() {
        defer wg.Done()
        counter++ // not atomic
    }()
}
wg.Wait()
fmt.Println(counter) // undefined result

// GOOD: atomic operation
var counter atomic.Int64
for range 1000 {
    wg.Add(1)
    go func() {
        defer wg.Done()
        counter.Add(1)
    }()
}
wg.Wait()
fmt.Println(counter.Load()) // always 1000
```

Always run tests and programs with the `-race` flag:

```bash
go test -race ./...
go run -race main.go
```

### 3. main exits before goroutines finish

```go
// BAD: main may exit before the goroutine prints anything
func main() {
    go fmt.Println("goroutine") // may never execute
}

// GOOD: wait for completion
func main() {
    var wg sync.WaitGroup
    wg.Add(1)
    go func() {
        defer wg.Done()
        fmt.Println("goroutine")
    }()
    wg.Wait()
}
```

### 4. Loop variable capture (before Go 1.22)

In Go 1.22+ the `for i := range n` loop variable is re-created on each iteration, so closures capture distinct values. If you support older Go versions, pass the variable as a function argument explicitly:

```go
// Safe in Go 1.22+ (current behavior):
for i := range 5 {
    go func() {
        fmt.Println(i) // each goroutine sees its own i
    }()
}

// Explicit argument — safe in all Go versions:
for i := range 5 {
    go func(n int) {
        fmt.Println(n)
    }(i)
}
```

---

## Self-Check Questions

1. **How does a goroutine differ from an OS thread in terms of memory footprint and context-switch cost?**
   A goroutine starts with a 2–8 KB stack (vs ~1–8 MB for an OS thread) and switches in user space without a syscall, making it orders of magnitude cheaper.

2. **Explain the GMP model. What happens to `P` when `M` blocks on a syscall?**
   The `M` detaches from its `P`; the runtime creates or wakes up a new `M` and hands it the `P` — execution continues without stalling.

3. **What is work stealing and why does it matter?**
   When a `P`'s LRQ is empty, it steals half of another `P`'s LRQ. This balances load dynamically and prevents idle processors.

4. **Why could a goroutine "freeze" a thread before Go 1.14, but not today?**
   Prior to 1.14 the scheduler was cooperative — a goroutine yielded only at explicit cooperation points. Since 1.14, async preemption via `SIGURG` lets `sysmon` forcibly preempt any goroutine that has been running for more than 10 ms, even one stuck in a tight loop with no function calls.
