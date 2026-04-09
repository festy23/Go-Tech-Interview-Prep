---
title: Handlers and Routing in Go
blockId: server-handlers
parentBlockId: server
---

# Handlers and Routing in Go

Handlers are the heart of every Go server. Everything that happens while processing an HTTP request — path matching, validation, business logic, response formation — flows through them. Understanding `http.Handler`, the enhanced `ServeMux`, and the middleware pattern is essential for any Go developer working on the server side.

## The http.Handler Interface

Go's entire HTTP stack is built around a single interface:

```go
type Handler interface {
    ServeHTTP(ResponseWriter, *Request)
}
```

Any type implementing `ServeHTTP` can act as a handler: a struct carrying dependencies, a function adapter, or an entire router. This minimalism is exactly what makes Go middleware so elegant — a wrapper around a `Handler` is itself a `Handler`.

`http.ResponseWriter` is the response-writing interface. Key methods:
- `Header() http.Header` — access response headers (set them before calling `WriteHeader`).
- `WriteHeader(statusCode int)` — send the status code (can only be called once).
- `Write([]byte) (int, error)` — write the response body.

`*http.Request` — the incoming request struct. Contains method, URL, headers, body, and, since Go 1.22, methods for accessing path variables.

## HandlerFunc: Functions as Handlers

For simple cases where a struct is overkill, `http.HandlerFunc` adapts a plain function to the `Handler` interface:

```go
type HandlerFunc func(ResponseWriter, *Request)

func (f HandlerFunc) ServeHTTP(w ResponseWriter, r *Request) {
    f(w, r)
}
```

This lets you pass plain functions wherever `http.Handler` is expected:

```go
mux.Handle("GET /users", http.HandlerFunc(listUsers))
// or shorter:
mux.HandleFunc("GET /users", listUsers)
```

## ServeMux in Go 1.22: Enhanced Patterns

Before Go 1.22, the standard `ServeMux` only supported prefix matching on the path — the HTTP method was ignored. Since Go 1.22, the pattern syntax is substantially richer:

```go
mux := http.NewServeMux()

// Method + path
mux.HandleFunc("GET /api/users", listUsers)
mux.HandleFunc("POST /api/users", createUser)
mux.HandleFunc("DELETE /api/users/{id}", deleteUser)

// Path only (all methods)
mux.HandleFunc("/health", healthCheck)

// Trailing wildcard (prefix match)
mux.HandleFunc("/static/", serveStatic)
```

New pattern features:
- **Method prefix**: `GET /path`, `POST /path`, `DELETE /path/{id}`.
- **Path variables**: `{name}` — captures one path segment.
- **Wildcard**: `{name...}` — captures the rest of the path.
- **Trailing slash**: `/api/users/` — prefix match for all sub-paths.

Priority: the more specific pattern wins. `GET /api/users/{id}` takes precedence over `GET /api/users/`.

## r.PathValue(): Extracting Path Variables

`r.PathValue(name string) string` was introduced in Go 1.22 alongside the enhanced `ServeMux`:

```go
mux.HandleFunc("GET /api/users/{id}", func(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")
    if id == "" {
        http.Error(w, "missing id", http.StatusBadRequest)
        return
    }
    userID, err := strconv.Atoi(id)
    if err != nil {
        http.Error(w, "invalid id", http.StatusBadRequest)
        return
    }
    // ...
})
```

If the variable is not found or the pattern does not contain the given name, an empty string is returned — no panic.

Wildcard capture:

```go
mux.HandleFunc("GET /files/{path...}", func(w http.ResponseWriter, r *http.Request) {
    filePath := r.PathValue("path") // e.g. "docs/api/v1/index.html"
    // ...
})
```

## Request Lifecycle

Understanding the path from `net.Listener` to handler is critical for debugging and writing middleware:

1. **Accept** — `net.Listener` accepts a TCP connection.
2. **Goroutine** — `http.(*conn).serve` is launched in a new goroutine per connection.
3. **Read** — the HTTP request is parsed into `*http.Request`.
4. **Dispatch** — `ServeMux.ServeHTTP` finds the most specific matching pattern.
5. **Handler chain** — middleware wrappers are called in sequence.
6. **Business logic** — the terminal handler builds the response.
7. **Write** — `ResponseWriter` flushes headers and body to the TCP connection.

Important details:
- Once `Write` or `WriteHeader` is called, headers are already sent — they cannot be changed.
- `r.Body` must be read and closed explicitly, or the connection will not return to the pool.
- A panic in a handler that is not recovered by middleware terminates the goroutine but not the whole server.

## The Middleware Pattern

Middleware is a function that accepts an `http.Handler` and returns a new `http.Handler`, adding logic before and/or after the wrapped handler:

```go
func Middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Logic BEFORE the handler
        next.ServeHTTP(w, r)
        // Logic AFTER the handler
    })
}
```

Multiple middleware can be chained. Manual approach:

```go
handler := AuthMiddleware(LoggingMiddleware(mux))
```

A helper keeps this readable:

```go
func Chain(h http.Handler, middlewares ...func(http.Handler) http.Handler) http.Handler {
    for i := len(middlewares) - 1; i >= 0; i-- {
        h = middlewares[i](h)
    }
    return h
}

handler := Chain(mux, LoggingMiddleware, AuthMiddleware, RecoveryMiddleware)
```

### Essential Middleware

**Logging middleware** — records method, path, status, and duration:

```go
type responseWriter struct {
    http.ResponseWriter
    status int
}

func (rw *responseWriter) WriteHeader(code int) {
    rw.status = code
    rw.ResponseWriter.WriteHeader(code)
}

func LoggingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}
        start := time.Now()
        next.ServeHTTP(rw, r)
        slog.Info("http",
            "method", r.Method,
            "path", r.URL.Path,
            "status", rw.status,
            "duration", time.Since(start),
        )
    })
}
```

**Recovery middleware** — catches panics:

```go
func RecoveryMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if rec := recover(); rec != nil {
                slog.Error("panic recovered", "error", rec,
                    "stack", debug.Stack())
                http.Error(w, "internal server error",
                    http.StatusInternalServerError)
            }
        }()
        next.ServeHTTP(w, r)
    })
}
```

**Context middleware** — injects values into the request context:

```go
type contextKey string

const requestIDKey contextKey = "requestID"

func RequestIDMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        id := uuid.New().String()
        ctx := context.WithValue(r.Context(), requestIDKey, id)
        w.Header().Set("X-Request-ID", id)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

// In a handler:
id := r.Context().Value(requestIDKey).(string)
```

## Passing Dependencies via a Struct

Global variables break testability and are an anti-pattern in Go. The correct approach is injecting dependencies through a server struct:

```go
type Handler struct {
    db    *sql.DB
    log   *slog.Logger
    cache *redis.Client
}

func NewHandler(db *sql.DB, log *slog.Logger, cache *redis.Client) *Handler {
    return &Handler{db: db, log: log, cache: cache}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
    mux.HandleFunc("GET /api/users", h.listUsers)
    mux.HandleFunc("POST /api/users", h.createUser)
    mux.HandleFunc("GET /api/users/{id}", h.getUser)
    mux.HandleFunc("DELETE /api/users/{id}", h.deleteUser)
}

func (h *Handler) listUsers(w http.ResponseWriter, r *http.Request) {
    users, err := h.db.QueryContext(r.Context(), "SELECT id, name FROM users")
    if err != nil {
        h.log.Error("query users", "error", err)
        http.Error(w, "internal error", http.StatusInternalServerError)
        return
    }
    defer users.Close()
    // ...
}
```

## Reading and Writing JSON

Standard pattern for JSON APIs:

```go
func respond(w http.ResponseWriter, status int, v any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    if err := json.NewEncoder(w).Encode(v); err != nil {
        slog.Error("encode response", "error", err)
    }
}

func decode[T any](r *http.Request) (T, error) {
    var v T
    if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
        return v, fmt.Errorf("decode body: %w", err)
    }
    return v, nil
}

// Usage
func (h *Handler) createUser(w http.ResponseWriter, r *http.Request) {
    input, err := decode[CreateUserRequest](r)
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    // ...
    respond(w, http.StatusCreated, user)
}
```

Limit the request body: `r.Body = http.MaxBytesReader(w, r.Body, 1<<20)` (1 MB) — protection against DoS.

## Comparison: stdlib vs chi vs gin

**Standard library (Go 1.22+)**:
- Pros: zero dependencies, stable API, the new patterns cover 80% of routing needs.
- Cons: no route groups, no built-in parameter binding, middleware must be chained manually.

**chi**:
- Pros: `Use` for middleware stack, `Route` for groups, `chi.URLParam` for path params, fully compatible with `net/http` handlers.
- Cons: external dependency, functionality barely differs from stdlib after Go 1.22.

```go
r := chi.NewRouter()
r.Use(middleware.Logger)
r.Use(middleware.Recoverer)

r.Route("/api", func(r chi.Router) {
    r.Get("/users", listUsers)
    r.Post("/users", createUser)
    r.Get("/users/{id}", getUser)
})
```

**gin**:
- Pros: high throughput, built-in binding (`c.ShouldBindJSON`), tag-based validation, large ecosystem.
- Cons: custom context type (`*gin.Context`), not directly compatible with `net/http` middleware, larger binary.

```go
r := gin.Default()
r.GET("/api/users/:id", func(c *gin.Context) {
    id := c.Param("id")
    c.JSON(http.StatusOK, user)
})
```

**When to use what**: for new projects, standard `ServeMux` plus manual middleware is enough for most APIs. chi makes sense with a deep route hierarchy. gin is a good choice when maximum throughput is required or your team already knows it.

## Common Mistakes

**1. Writing to ResponseWriter after the handler returns.** If middleware calls `next.ServeHTTP(w, r)` and then tries to set a header, it is too late. Use a `ResponseWriter` wrapper to capture the status.

**2. Not closing `r.Body`.** Reading and closing the request body is the handler's responsibility. `defer r.Body.Close()` at the top of the handler.

**3. No body size limit.** Without `MaxBytesReader`, a client can send gigabytes of data and exhaust server memory.

**4. Concurrent writes to ResponseWriter.** `ResponseWriter` is not goroutine-safe. Never write to it from multiple goroutines simultaneously.

**5. Panic instead of returning an error.** On error, send a response and `return` — do not panic. Panics are for truly unexpected situations.

## Summary

Go 1.22+ covers the vast majority of routing needs without external dependencies. The `http.Handler` interface combined with the middleware pattern yields a flexible, testable architecture. Injecting dependencies through a struct rather than using global state is the hallmark of idiomatic Go server design.
