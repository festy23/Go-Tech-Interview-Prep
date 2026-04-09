---
title: Context
blockId: concurrency-context
parentBlockId: concurrency
---

# Context

The `context` package is one of the primary tools for managing goroutine lifecycle in Go. It solves the problem of propagating cancellation signals, deadlines, and arbitrary values through call chains in a concurrent program.

---

## Goroutine leaks and why context exists

A goroutine started without a stop mechanism lives until the program exits. This is called a goroutine leak. A classic scenario:

```go
// WRONG: goroutine leak
func handler(w http.ResponseWriter, r *http.Request) {
    go func() {
        result := slowDBQuery() // what if the client already disconnected?
        respond(w, result)
    }()
}
```

If the client closed the connection, the goroutine keeps executing an expensive DB query and then tries to write to an already-closed `ResponseWriter`. Context ties the goroutine's lifecycle to the request context:

```go
// RIGHT: request context is passed to the DB
func handler(w http.ResponseWriter, r *http.Request) {
    result, err := slowDBQuery(r.Context())
    if err != nil {
        http.Error(w, err.Error(), 500)
        return
    }
    respond(w, result)
}
```

Now when the client leaves, `r.Context()` is cancelled and the DB query is interrupted.

---

## context.Background() and context.TODO()

Both return an empty context with no cancellation, no deadline, and no values. The difference is semantic:

- `context.Background()` — the root context for long-lived operations: `main`, tests, server initialization.
- `context.TODO()` — a temporary placeholder when the correct context is unclear. It signals: "this needs to be decided later".

```go
func main() {
    ctx := context.Background()
    srv := NewServer(ctx)
    srv.Run()
}

// Placeholder during refactoring — replace with the real context later
func legacyFunc() {
    ctx := context.TODO()
    oldCodeThatNeedsContext(ctx)
}
```

Static analysis tools can flag `context.TODO()` as a warning — that is intentional.

---

## context.WithCancel and WithCancelCause (Go 1.20+)

`context.WithCancel` returns a child context and a cancel function. Calling `cancel()` signals all descendants of that context.

```go
func doWork(parent context.Context) error {
    ctx, cancel := context.WithCancel(parent)
    defer cancel() // mandatory! otherwise a leak

    results := make(chan int)
    go worker(ctx, results)

    select {
    case r := <-results:
        fmt.Println("got:", r)
        return nil
    case <-ctx.Done():
        return ctx.Err()
    }
}
```

`defer cancel()` is a mandatory pattern. Without it, the child context is not released until the parent context is done.

### WithCancelCause (Go 1.20)

`context.WithCancelCause` lets you attach a cancellation reason:

```go
ctx, cancel := context.WithCancelCause(parent)

go func() {
    if err := fetchData(ctx); err != nil {
        cancel(fmt.Errorf("fetchData failed: %w", err))
        return
    }
    cancel(nil)
}()

<-ctx.Done()
fmt.Println("cause:", context.Cause(ctx))
```

`context.Cause(ctx)` returns the error passed to `cancel()`. If cancellation happened without a cause or via a plain context, it returns `ctx.Err()`.

---

## context.WithTimeout and WithDeadline

`WithTimeout` and `WithDeadline` add a time limit. The only difference is how the boundary is expressed:

```go
// Timeout: in 5 seconds from now
ctx, cancel := context.WithTimeout(parent, 5*time.Second)
defer cancel()

// Deadline: at a specific moment in time
deadline := time.Now().Add(5 * time.Second)
ctx, cancel := context.WithDeadline(parent, deadline)
defer cancel()
```

Both return a `cancel` function. Always call it via `defer`, even if the timeout already fired — this releases the timer resources.

```go
func callExternalAPI(ctx context.Context) (*Response, error) {
    ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
    defer cancel()

    req, _ := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        if errors.Is(err, context.DeadlineExceeded) {
            return nil, fmt.Errorf("API timeout after 3s")
        }
        return nil, err
    }
    defer resp.Body.Close()
    return parseResponse(resp)
}
```

### WithTimeoutCause (Go 1.21)

Go 1.21 added `context.WithTimeoutCause` — like `WithTimeout` but with a custom error:

```go
ctx, cancel := context.WithTimeoutCause(
    parent,
    3*time.Second,
    fmt.Errorf("external API did not respond within 3 seconds"),
)
defer cancel()

// After timeout fires:
// context.Cause(ctx) → "external API did not respond within 3 seconds"
// ctx.Err()          → context.DeadlineExceeded
```

This is useful for diagnostics: `Cause` carries the detailed message, while `Err()` returns the standard error for `errors.Is` checks.

---

## context.AfterFunc (Go 1.21)

`context.AfterFunc` registers a function to be called in a new goroutine when the context is cancelled:

```go
ctx, cancel := context.WithCancel(context.Background())

stop := context.AfterFunc(ctx, func() {
    fmt.Println("context cancelled, running cleanup")
    cleanup()
})
defer stop() // deregister if the context was never cancelled

// ... main work ...
cancel()
```

`AfterFunc` returns a `stop` function. If you call `stop()` before the context is cancelled, the callback will not run. This is important for preventing unnecessary operations.

### Integrating with legacy libraries

`AfterFunc` is especially useful for integrating with libraries that do not support context natively:

```go
func doWithLegacyLib(ctx context.Context) error {
    conn := legacyLib.NewConnection()

    stop := context.AfterFunc(ctx, func() {
        conn.Close() // close the connection when context is cancelled
    })
    defer stop()

    return conn.Execute("SELECT 1")
}
```

---

## context.Cause (Go 1.20)

`context.Cause` returns the root cause of a context's cancellation:

```go
ctx, cancel := context.WithCancelCause(context.Background())
cancel(errors.New("retry limit exceeded"))

fmt.Println(ctx.Err())          // context.Canceled
fmt.Println(context.Cause(ctx)) // retry limit exceeded
```

The cause chain works through nested contexts: `Cause` returns the cause of the first context in the chain for which one was set.

---

## Context propagation patterns

### First argument of a function

Context is passed as the first argument named `ctx`. This is a convention adopted throughout the Go community:

```go
// Right
func GetUser(ctx context.Context, id int64) (*User, error)

// Wrong: ctx is not the first argument
func GetUser(id int64, ctx context.Context) (*User, error)
```

### Do not store context in a struct

Storing a context in a struct is an anti-pattern. A context is tied to a specific request or operation, while a struct lives longer.

```go
// WRONG
type Service struct {
    ctx context.Context // don't do this!
    db  *sql.DB
}

func (s *Service) GetUser(id int64) (*User, error) {
    return queryUser(s.ctx, s.db, id)
}

// RIGHT: context via argument
type Service struct {
    db *sql.DB
}

func (s *Service) GetUser(ctx context.Context, id int64) (*User, error) {
    return queryUser(ctx, s.db, id)
}
```

Exception: request structs (e.g. `http.Request` embeds a context), but that is a deliberate architectural decision.

### Values in context

`context.WithValue` stores arbitrary data in a context. Use it sparingly — only for data meaningful across an entire request: trace ID, authenticated user, request ID.

```go
type contextKey string

const userKey contextKey = "user"

func WithUser(ctx context.Context, user *User) context.Context {
    return context.WithValue(ctx, userKey, user)
}

func UserFromContext(ctx context.Context) (*User, bool) {
    u, ok := ctx.Value(userKey).(*User)
    return u, ok
}
```

Use non-string key types (or a custom type over string) to avoid collisions between packages.

---

## Propagation: HTTP to DB to gRPC

In a real server, context flows through every layer of request handling:

```go
func (h *Handler) CreateOrder(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context() // HTTP request context

    // Middleware has already enriched the context: trace ID, user
    user, _ := UserFromContext(ctx)

    // Pass context to the service layer
    order, err := h.orderService.Create(ctx, user.ID, r.Body)
    if err != nil {
        http.Error(w, err.Error(), 500)
        return
    }

    json.NewEncoder(w).Encode(order)
}

func (s *OrderService) Create(ctx context.Context, userID int64, body io.Reader) (*Order, error) {
    // Pass context to the repository (PostgreSQL/MongoDB)
    if err := s.repo.Save(ctx, order); err != nil {
        return nil, err
    }

    // Pass context to the gRPC call
    _, err := s.inventoryClient.Reserve(ctx, &pb.ReserveRequest{...})
    return order, err
}
```

If the client closes the connection at any layer, `ctx.Done()` closes everywhere down the chain.

---

## Common mistakes

### Leak from a forgotten cancel

```go
// WRONG: cancel is never called
func process(parent context.Context) {
    ctx, _ := context.WithTimeout(parent, time.Second)
    doWork(ctx)
    // cancel leaks together with the timer resources
}

// RIGHT
func process(parent context.Context) {
    ctx, cancel := context.WithTimeout(parent, time.Second)
    defer cancel()
    doWork(ctx)
}
```

### Ignoring cancellation

```go
// WRONG: ctx.Done() is never checked
func processItems(ctx context.Context, items []Item) {
    for _, item := range items {
        process(item) // continues even if context is cancelled
    }
}

// RIGHT
func processItems(ctx context.Context, items []Item) error {
    for _, item := range items {
        select {
        case <-ctx.Done():
            return ctx.Err()
        default:
        }
        if err := process(ctx, item); err != nil {
            return err
        }
    }
    return nil
}
```

### Passing a nil context

```go
// WRONG: nil context will panic
func getUser(ctx context.Context, id int) (*User, error) {
    req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
    // ...
}
getUser(nil, 42) // panic: nil context

// RIGHT: use context.Background()
getUser(context.Background(), 42)
```

### Capturing context in a goroutine without checking it

```go
// WRONG: context is captured in the closure but never watched
go func() {
    time.Sleep(10 * time.Second) // runs even after ctx is cancelled
    doWork()
}()

// RIGHT: goroutine respects the context
go func() {
    select {
    case <-time.After(10 * time.Second):
        doWork()
    case <-ctx.Done():
        return
    }
}()
```

---

## Summary

Context is a contract between the caller and the callee: "if I am cancelled, I will tell you." Core rules:

1. Always pass context as the first argument.
2. Never store a context in a struct.
3. Always call `cancel()` via `defer`.
4. Check `ctx.Done()` in long-running operations and loops.
5. Use `context.Cause` for detailed error diagnostics.
6. Use `context.AfterFunc` to integrate with code that does not support context natively.
