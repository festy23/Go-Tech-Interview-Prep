---
title: Package sync
blockId: concurrency-sync
parentBlockId: concurrency
---

# Package sync

Concurrent Go code is built around goroutines, channels, and the `sync` package. Channels are great for passing data between goroutines, but for protecting shared state the primitives in `sync` are often simpler and more efficient. This article covers the full toolkit: mutexes, wait groups, one-time initialization, atomics, object pools, and the race detector.

---

## sync.Mutex and sync.RWMutex

`sync.Mutex` is the basic mutual-exclusion lock. A goroutine calls `Lock()`, executes the critical section, and calls `Unlock()`.

```go
type Counter struct {
    mu    sync.Mutex
    value int
}

func (c *Counter) Inc() {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.value++
}

func (c *Counter) Get() int {
    c.mu.Lock()
    defer c.mu.Unlock()
    return c.value
}
```

`defer c.mu.Unlock()` is the standard idiom. It guarantees the lock is released on any exit from the function, including panics. Skip `defer` only when the overhead matters in extremely hot loops.

### When to use RWMutex

`sync.RWMutex` separates read and write operations. Multiple goroutines can hold the read lock simultaneously, but the write lock is exclusive.

```go
type Config struct {
    mu   sync.RWMutex
    data map[string]string
}

func (c *Config) Get(key string) string {
    c.mu.RLock()
    defer c.mu.RUnlock()
    return c.data[key]
}

func (c *Config) Set(key, value string) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.data[key] = value
}
```

**Rule of thumb**: use `RWMutex` when reads significantly outnumber writes and critical sections are long enough that parallel reading provides a real speedup. For very short critical sections, `RWMutex` overhead can outweigh the benefit.

### Common mutex mistakes

A mutex must not be copied after first use. Pass structs with mutexes by pointer:

```go
// Wrong: copies the mutex
func process(c Counter) { ... }

// Right: pass by pointer
func process(c *Counter) { ... }
```

---

## sync.WaitGroup and wg.Go() (Go 1.25)

`sync.WaitGroup` lets you wait for a group of goroutines to finish. Go 1.25 added the `wg.Go()` method, which accepts a function, launches it in a goroutine, and automatically manages the counter — no more manual `Add/Done`.

```go
func fetchAll(urls []string) []string {
    var (
        wg      sync.WaitGroup
        mu      sync.Mutex
        results []string
    )

    for _, url := range urls {
        wg.Go(func() {
            data := fetch(url) // url captured by reference in Go 1.22+
            mu.Lock()
            results = append(results, data)
            mu.Unlock()
        })
    }

    wg.Wait()
    return results
}
```

`wg.Go()` combines `wg.Add(1)` and goroutine launch in one call. Inside the goroutine, `Done()` is called automatically after the function returns. This eliminates the entire class of bugs where a programmer forgets to call `Done()` or calls `Add()` after the goroutine has already started.

### Fan-out pattern with wg.Go

```go
func processItems(items []Item) {
    var wg sync.WaitGroup
    for i := range len(items) {  // Go 1.22+: range over integer
        wg.Go(func() {
            process(items[i])
        })
    }
    wg.Wait()
}
```

Note the `for i := range len(items)` syntax — modern Go 1.22+, no need for `for i := 0; i < len(items); i++`.

---

## sync.Once, sync.OnceFunc, sync.OnceValue (Go 1.21+)

`sync.Once` guarantees a function runs exactly once regardless of how many goroutines call it concurrently. The classic use case is lazy singleton initialization.

```go
var (
    instance *DB
    once     sync.Once
)

func GetDB() *DB {
    once.Do(func() {
        instance = connectDB()
    })
    return instance
}
```

### sync.OnceValue — initialization with a return value (Go 1.21)

`sync.Once` is awkward when you need to return the initialization result. Go 1.21 added `sync.OnceValue`:

```go
var getDB = sync.OnceValue(func() *DB {
    return connectDB()
})

// Usage: db := getDB()
```

`sync.OnceValue` takes a zero-argument function returning `T` and returns a `func() T` that executes the function on the first call, caches the result, and returns it on all subsequent calls.

### sync.OnceFunc — one-shot call of an arbitrary function (Go 1.21)

```go
var initLogger = sync.OnceFunc(func() {
    log.SetFlags(log.Ltime | log.Lshortfile)
    log.SetOutput(os.Stderr)
})

// initLogger() can be called from anywhere — runs only once
```

`sync.OnceFunc` is equivalent to `sync.Once.Do` but returns a function, so you don't need to store a `sync.Once` variable.

---

## sync/atomic — atomic operations

The `sync/atomic` package provides low-level atomic primitives. Go 1.19 introduced typed atomic types that are much more ergonomic than the function-based API.

### atomic.Bool

```go
type Server struct {
    running atomic.Bool
}

func (s *Server) Start() {
    if s.running.Swap(true) {
        return // already running
    }
    go s.serve()
}

func (s *Server) Stop() {
    s.running.Store(false)
}
```

### atomic.Int64

```go
var requestCount atomic.Int64

func handleRequest(w http.ResponseWriter, r *http.Request) {
    requestCount.Add(1)
    // ...
}

func getStats() int64 {
    return requestCount.Load()
}
```

### atomic.Pointer[T] (Go 1.19)

An atomic pointer enables lock-free live config replacement:

```go
type AppConfig struct {
    Timeout time.Duration
    MaxConn int
}

var config atomic.Pointer[AppConfig]

func init() {
    config.Store(&AppConfig{Timeout: 5 * time.Second, MaxConn: 100})
}

func updateConfig(newCfg *AppConfig) {
    config.Store(newCfg)
}

func getTimeout() time.Duration {
    return config.Load().Timeout
}
```

**When to use atomics vs mutexes**: atomics are appropriate for simple counters, flags, and pointers to immutable structs. For invariants spanning multiple variables, reach for a mutex.

---

## sync.Pool — object reuse

`sync.Pool` caches temporary objects, reducing GC pressure. The typical scenario is buffers or complex structs that are frequently created and discarded.

Go 1.26 introduced the `new(val)` expression, which creates a pointer to a value directly — without an intermediate variable. For example, `new(0)` returns `*int` pointing to `0`; `new(false)` returns `*bool`. This is handy in `sync.Pool.New` fields and anywhere else a pointer to a primitive is needed:

```go
// Go 1.26: new(val) — pointer to a value, no intermediate variable
limit := new(100) // *int → 100, instead of: n := 100; &n
```

```go
var bufPool = sync.Pool{
    New: func() any {
        return new(bytes.Buffer)
    },
}

func encode(data any) ([]byte, error) {
    buf := bufPool.Get().(*bytes.Buffer)
    buf.Reset()
    defer bufPool.Put(buf)

    if err := json.NewEncoder(buf).Encode(data); err != nil {
        return nil, err
    }
    return buf.Bytes(), nil
}
```

### Important Pool nuances

- Objects in the pool can be collected by the GC at any time — do not rely on state being preserved.
- Always call `Reset()` before using an object from the pool, since the previous user may have left data in it.
- `sync.Pool` is not for long-lived objects — use a regular cache for those.
- The pool is partitioned per P (logical processor), so contention is minimal.

---

## Data races and the -race detector

A data race occurs when two goroutines access the same variable without synchronization and at least one of them writes. Races are one of the most insidious bugs: they may not surface during ordinary testing.

### Example of a race

```go
// WRONG: data race
func badCounter() {
    var count int
    var wg sync.WaitGroup
    for range 1000 {
        wg.Go(func() {
            count++ // race! multiple goroutines read and write count
        })
    }
    wg.Wait()
    fmt.Println(count) // unpredictable result
}
```

### Running the race detector

```bash
go test -race ./...
go run -race main.go
go build -race -o myapp .
```

The `-race` flag adds compile-time instrumentation that tracks all memory accesses and reports races at runtime. Overhead is roughly 5-10x CPU time and 2-5x memory, so it cannot be used in production.

### Fixing the race

```go
// Option 1: atomic
func atomicCounter() int {
    var count atomic.Int64
    var wg sync.WaitGroup
    for range 1000 {
        wg.Go(func() {
            count.Add(1)
        })
    }
    wg.Wait()
    return int(count.Load())
}

// Option 2: mutex
func mutexCounter() int {
    var (
        count int
        mu    sync.Mutex
        wg    sync.WaitGroup
    )
    for range 1000 {
        wg.Go(func() {
            mu.Lock()
            count++
            mu.Unlock()
        })
    }
    wg.Wait()
    return count
}
```

---

## errgroup — goroutines with error handling

The standard `sync.WaitGroup` does not propagate errors from goroutines. The `golang.org/x/sync/errgroup` package solves this.

```go
import "golang.org/x/sync/errgroup"

func fetchAll(ctx context.Context, urls []string) ([][]byte, error) {
    g, ctx := errgroup.WithContext(ctx)
    results := make([][]byte, len(urls))

    for i, url := range urls {
        g.Go(func() error {
            resp, err := ctxhttp.Get(ctx, nil, url)
            if err != nil {
                return fmt.Errorf("fetch %s: %w", url, err)
            }
            defer resp.Body.Close()
            results[i], err = io.ReadAll(resp.Body)
            return err
        })
    }

    if err := g.Wait(); err != nil {
        return nil, err
    }
    return results, nil
}
```

`errgroup.WithContext` creates a child context that is cancelled on the first error. This lets remaining goroutines exit early if they check `ctx.Done()`.

### Limiting concurrency

```go
g.SetLimit(10) // no more than 10 goroutines at a time

for _, url := range urls {
    g.Go(func() error {
        return processURL(ctx, url)
    })
}
```

`SetLimit` adds a semaphore that prevents system overload when there are large numbers of tasks.

---

## Go 1.26: new(val)

Go 1.26 extended the built-in `new` function: it now accepts a value, not just a type, creating a pointer to it directly:

```go
// Before Go 1.26
n := 42
p := &n // *int → 42

// Go 1.26
p := new(42) // *int → 42, one line

// Useful for pointers to bool, int, and other primitives
enabled := new(true)    // *bool
timeout := new(30)      // *int
```

This removes the need for an intermediate variable when initialising struct fields, passing arguments, or working with `atomic.Pointer`:

```go
// Initialising atomic.Pointer without an intermediate variable
var p atomic.Pointer[int]
p.Store(new(42)) // ← Go 1.26
```

---

## Summary

| Primitive | When to use |
|---|---|
| `sync.Mutex` | Protecting any shared state |
| `sync.RWMutex` | Many readers, infrequent writes |
| `sync.WaitGroup` / `wg.Go()` | Waiting for goroutines to finish |
| `sync.Once` / `OnceValue` | One-time initialization |
| `atomic.*` | Simple counters and flags without a mutex |
| `sync.Pool` | Reusing expensive-to-allocate objects |
| `errgroup` | Goroutines that need to return errors |
| `new(val)` (Go 1.26) | Pointer to a value without an intermediate variable |

The `-race` detector should be part of CI — run `go test -race ./...` on every PR.
