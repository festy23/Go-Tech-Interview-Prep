---
title: Concurrency in Go
blockId: concurrency
parentBlockId: null
---

# Concurrency in Go

Concurrency is one of the main reasons Go became a dominant language for backend development. Its built-in model of goroutines and channels lets you write concurrent programs without the heavyweight abstractions of OS threads or callback chains. In the context of technical interviews, this topic comes up almost every time: from conceptual questions like "how does a goroutine differ from an OS thread" to hands-on tasks involving deadlocks and goroutine leaks.

## Why It Matters

Go was designed for server software where concurrency is the default: HTTP requests arrive simultaneously, database calls need to run in parallel, and background jobs must not block the main path. Rather than allocating OS threads (expensive — several MB of stack each), Go launches goroutines — lightweight coroutines with an initial stack of around 8 KB, multiplexed onto OS threads by the Go scheduler.

Interview questions on concurrency fall into three categories:
1. **Conceptual questions** — memory model, happens-before, the M:N scheduler.
2. **Code reading** — "what does this program print", "is there a data race here".
3. **Implementation tasks** — build a worker pool, graceful shutdown, rate limiter.

Understanding all four layers — goroutines, channels, the `sync` package, and `context` — gives you the vocabulary to handle any of these confidently.

## Goroutines — the Foundation of Concurrency

A goroutine is started by prefixing a function call with the `go` keyword. The Go scheduler (running across GOMAXPROCS OS threads) distributes goroutines across available CPU cores automatically.

```go
go func() {
    fmt.Println("hello from a goroutine")
}()
```

To wait for a group of goroutines and collect errors, Go 1.25 provides `errgroup` with the `wg.Go()` method, which handles panics and returns the first error encountered:

```go
import "golang.org/x/sync/errgroup"

g, ctx := errgroup.WithContext(context.Background())

for i := range 5 {
    g.Go(func() error {
        return processItem(ctx, i)
    })
}

if err := g.Wait(); err != nil {
    log.Fatal(err)
}
```

Note: since Go 1.22, loop variables are scoped per iteration, so there is no need for the old `i := i` capture trick.

For a deeper look at goroutines, the M:N scheduler, and common patterns, see the dedicated **Goroutines** article.

## Channels — Communication Between Goroutines

Channels are typed queues for sending values between goroutines. The Go philosophy: "do not communicate by sharing memory; share memory by communicating."

```go
ch := make(chan int, 1) // buffered channel with capacity 1

ch <- 42     // send
v := <-ch    // receive
```

An unbuffered channel synchronises sender and receiver — the send blocks until the receiver is ready. A buffered channel allows up to N values in flight without blocking the sender.

Common channel patterns:
- **Pipeline** — chain of processing stages, each reading from the previous channel.
- **Fan-out / fan-in** — distribute work across goroutines and collect results.
- **Done channel** — broadcast a cancellation signal (older pattern; `context.WithCancel` is preferred today).

For detailed coverage of channel mechanics and patterns, see the **Channels** article.

## The sync Package — Low-Level Primitives

When a channel would be overkill, or when you need fine-grained protection of shared state, reach for the `sync` package.

**`sync.Mutex` / `sync.RWMutex`** — guard a critical section. `RWMutex` allows multiple concurrent readers with an exclusive writer.

```go
var mu sync.Mutex
counter := 0

mu.Lock()
counter++
mu.Unlock()
```

**`sync.WaitGroup`** — wait for N goroutines to finish. The classic `Add(1) + go + Done()` pattern is still common when `errgroup` is not needed.

**`sync.Once`** — execute a function exactly once, even under concurrent calls. Perfect for lazy initialisation:

```go
var once sync.Once
var instance *MyService

func getInstance() *MyService {
    once.Do(func() {
        instance = &MyService{}
    })
    return instance
}
```

**`sync.Map`** — a concurrency-safe map. Well-suited for read-heavy workloads with infrequent writes; for write-heavy scenarios a plain `map + Mutex` tends to be faster.

**`sync/atomic`** — atomic operations on integers and pointers without a mutex. Used in hot paths where mutex overhead is measurable.

**Go 1.26: `new(val)`** — the built-in `new` now accepts a value, returning a pointer to it without an intermediate variable: `new(0)` gives `*int` pointing to zero, `new(true)` gives `*bool`. Handy when initialising `atomic.Pointer` or passing optional arguments.

For detailed coverage of each primitive and when to choose one over another, see the **sync Package** article.

## Context — Lifecycle Management

`context.Context` is the standard way to propagate cancellation signals, deadlines, and request-scoped values through a call chain. Every I/O-bound API in the Go standard library accepts a `context.Context` as its first argument.

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel() // always release resources

req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
```

Three key constructors:
- `context.WithCancel` — manual cancellation by calling `cancel()`.
- `context.WithTimeout` — automatic cancellation after a duration.
- `context.WithDeadline` — automatic cancellation at a specific point in time.

Context must be passed explicitly as the first argument — never stored in a struct. Child contexts are automatically cancelled when their parent is cancelled.

**Go 1.26: `errors.AsType[T](err)`** — a generic version of `errors.As` that requires no target variable: `if e := errors.AsType[*url.Error](err); e != nil { ... }`. Particularly concise when unwrapping errors that arise from context cancellation.

For detailed coverage of the context tree, value propagation, and best practices, see the **Context** article.

## Common Mistakes Interviewers Look For

**1. Goroutine leak.** A goroutine blocks on a channel or operation that never completes. The program's memory grows without bound. Fix: always provide a cancellation path via a done channel or `context`.

```go
// Bad: goroutine hangs forever if the receiver is gone
go func() {
    ch <- result // leak if the consumer has exited
}()

// Good: respect cancellation
go func() {
    select {
    case ch <- result:
    case <-ctx.Done():
    }
}()
```

**2. Data race on shared state.** Concurrent reads and writes to the same variable without synchronisation are undefined behaviour. Run tests with `-race` to detect races automatically.

**3. Deadlock.** Two goroutines wait on each other indefinitely. A classic case: sending to an unbuffered channel with no receiver. The Go runtime detects total deadlocks and panics with `all goroutines are asleep`.

**4. Loop variable capture (pre-Go 1.22).** Before Go 1.22, all goroutines launched inside a loop shared the same `i` variable by reference. Since Go 1.22, each iteration has its own variable — the bug no longer exists in modern code.

**5. Forgetting to call `cancel()`.** `context.WithCancel` and `context.WithTimeout` both return a `cancel` function. If you never call it, the child context stays alive until the parent is done — a resource leak. The pattern `defer cancel()` immediately after context creation is mandatory.

## What's Next

This article is a high-level overview. Each topic is covered in depth in a dedicated article:

- **Goroutines** — the M:N scheduler, GOMAXPROCS, worker pool and pipeline patterns.
- **Channels** — buffered vs unbuffered, `select`, directional channels, common patterns.
- **sync Package** — Mutex, RWMutex, WaitGroup, Once, Map, atomic.
- **Context** — context tree, propagation, storing values, best practices.

Recommended learning order: goroutines → channels → sync → context. Then practise combined tasks: graceful server shutdown, rate limiter, semaphore via channels.
