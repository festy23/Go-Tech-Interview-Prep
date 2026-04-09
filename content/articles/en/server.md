---
title: Server Development in Go
blockId: server
parentBlockId: null
---

# Server Development in Go

Go has become the default choice for HTTP servers and microservices for good reason: the standard library provides everything you need out of the box, and the runtime's performance exceeds most JVM platforms at a fraction of the memory footprint. In technical interviews, server-side development is one of the most commonly tested areas — from questions about the request lifecycle to hands-on tasks involving graceful shutdown, authentication, and testing.

## Why Go for Servers

Every incoming HTTP request is handled in a separate goroutine — no thread pool to configure, no callbacks, no `async/await`. The code reads sequentially but runs concurrently. Under 10 000 simultaneous connections a Go server typically uses 80–100 MB of RAM, compared to 400–600 MB for Node.js and 1 GB+ for Spring Boot.

Key advantages for server development:
- **`net/http` package** — a full HTTP/1.1 and HTTP/2 server in the standard library.
- **`ServeMux` since Go 1.22** — enhanced routing patterns (`GET /api/{id}`) without third-party routers.
- **`context.Context`** — first-class propagation of cancellation, deadlines, and tracing.
- **Goroutines** — cheap concurrency with no explicit thread management.

## How an HTTP Server Works

A minimal Go HTTP server:

```go
package main

import (
    "fmt"
    "net/http"
)

func main() {
    http.HandleFunc("GET /hello", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintln(w, "Hello, Go 1.25!")
    })

    http.ListenAndServe(":8080", nil)
}
```

Several layers operate under the hood: `ListenAndServe` opens a TCP socket, accepts connections in a loop, and launches a goroutine per request that dispatches to the right handler via `ServeMux`.

Since Go 1.22, `ServeMux` supports the HTTP method in the pattern (`GET /api/{id}`), and `r.PathValue("id")` extracts path variables — no third-party router needed for most use cases.

## Handlers and Middleware

The central abstraction is the `http.Handler` interface:

```go
type Handler interface {
    ServeHTTP(ResponseWriter, *Request)
}
```

Any type implementing `ServeHTTP` is a handler. For plain functions, the `http.HandlerFunc` adapter is convenient. Middleware is built as a chain: each layer wraps the next and adds logic before and/or after.

```go
func LoggingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        next.ServeHTTP(w, r)
        slog.Info("request", "method", r.Method, "path", r.URL.Path,
            "duration", time.Since(start))
    })
}
```

A typical middleware stack: logging → tracing → authentication → authorisation → business-logic handler. For a deep dive into routing, `r.PathValue()`, and router comparisons, see the **Handlers** article.

## Authentication and Security

Server applications almost always require authentication. Go does not prescribe a specific approach — that is a feature, since you control every detail.

**JWT** — the most common token format for stateless authentication. The server signs a token on login and verifies the signature on every request. No session store required.

**Sessions** — the traditional approach: the server stores sessions in Redis or PostgreSQL, and the client receives only an identifier in a cookie. Easier to invalidate, but requires a backing store.

**OAuth 2.0** — delegate authentication to a provider (Google, GitHub, Yandex). The `golang.org/x/oauth2` package provides a ready-made client.

**Passwords** — stored only as bcrypt hashes (`golang.org/x/crypto/bcrypt`). Never MD5 or unsalted SHA.

Authentication is implemented as middleware: it checks the `Authorization` header, validates the token, and places user data in the request context. For details, see the **Authentication** article.

## Error Handling

Idiomatic error handling is one of Go's most distinctive traits. There are no exceptions, no hidden `try/catch`. Every error is returned explicitly and handled at the call site.

In server code this manifests in three patterns:

1. **Error wrapping** via `fmt.Errorf("operation: %w", err)` preserves the chain for `errors.Is`/`errors.As`.
2. **Centralised error writer** — a single function turns a Go error into an HTTP response with the correct status and JSON body.
3. **Panic recovery middleware** — `recover()` in a deferred function catches unexpected panics and returns 500 instead of crashing the server.

```go
func writeError(w http.ResponseWriter, err error) {
    var httpErr *HTTPError
    if errors.As(err, &httpErr) {
        respond(w, httpErr.Status, httpErr)
        return
    }
    respond(w, http.StatusInternalServerError,
        map[string]string{"error": "internal server error"})
}
```

For details on error hierarchies, codes, and validation errors, see the **Error Handling** article.

## Testing Servers

Go ships the `httptest` package, which lets you test HTTP handlers without a real network connection. `httptest.NewRecorder()` captures the response; `httptest.NewServer()` starts a real local server for integration tests.

Since Go 1.24, `t.Context()` automatically creates a context that is cancelled when the test ends — no more manual `cancel()` calls in every test case. `b.Loop()` in benchmarks (Go 1.24) replaces the old `for range b.N` loop and correctly accounts for setup operations.

```go
func TestHelloHandler(t *testing.T) {
    req := httptest.NewRequest(http.MethodGet, "/hello", nil).
        WithContext(t.Context())
    w := httptest.NewRecorder()

    HelloHandler(w, req)

    if w.Code != http.StatusOK {
        t.Errorf("got %d, want 200", w.Code)
    }
}
```

For testcontainers, golden files, and integration test structure, see the **Testing** article.

## Common Interview Questions

**How does graceful shutdown work?** The server receives an OS signal (`SIGTERM`, `SIGINT`), stops accepting new connections, and waits for in-flight requests to finish via `server.Shutdown(ctx)`. Without this, Docker/Kubernetes can cut requests mid-flight.

```go
srv := &http.Server{Addr: ":8080", Handler: mux}

go func() {
    sigCh := make(chan os.Signal, 1)
    signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
    <-sigCh

    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    srv.Shutdown(ctx)
}()

srv.ListenAndServe()
```

**Why set `ReadTimeout` and `WriteTimeout`?** Without timeouts, a slow client ("slowloris") can block a goroutine indefinitely. Recommended values: `ReadTimeout: 5s`, `WriteTimeout: 10s`, `IdleTimeout: 120s`.

**How do you pass dependencies to a handler?** Through a closure or a struct. Global variables are avoided — they break testability.

```go
type Server struct {
    db  *sql.DB
    log *slog.Logger
}

func (s *Server) handleUsers(w http.ResponseWriter, r *http.Request) {
    // s.db and s.log available without global state
}
```

## What's Next

This article is a high-level overview of server development in Go. Each topic is covered in depth:

- **Handlers** — `http.Handler`, `ServeMux` Go 1.22, `r.PathValue()`, middleware, routers.
- **Authentication** — JWT, sessions, OAuth2, bcrypt, CORS, CSRF.
- **Error Handling** — error types, `errors.Is/As`, HTTP responses, panic recovery.
- **Testing** — `httptest`, `t.Context()`, testcontainers, benchmarks with `b.Loop()`.

Recommended order: handlers → error handling → authentication → testing. Then practise building a complete CRUD API with a middleware stack and integration tests.
