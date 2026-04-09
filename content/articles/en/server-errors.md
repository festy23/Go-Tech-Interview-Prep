---
title: Error Handling in Go Servers
blockId: server-errors
parentBlockId: server
---

# Error Handling in Go Servers

Error handling is the area where Go stands out most from other languages. No exceptions, no hidden try/catch, no "magic" framework interception. Every error is returned explicitly, handled at the call site, or propagated upward. In servers, this produces concrete patterns: how to turn a Go error into the correct HTTP response, how to preserve the error chain for debugging, and how to prevent a panic from bringing down the whole server.

## Foundational Principles

A Go error is a value implementing the `error` interface:

```go
type error interface {
    Error() string
}
```

Unlike exceptions, an error is an ordinary return value. This means:
- The compiler does not force you to handle it, but linters warn if you ignore an `error` return.
- The call chain is explicit — you can see exactly where an error originated and how it propagated.
- There is no "side-channel" catching — an error only goes where you explicitly pass it.

In a server the typical error path is: database layer → service layer → HTTP handler → HTTP response to the client.

## Custom Error Types

For server errors it is useful to create types that carry an HTTP status:

```go
// HTTPError — an error with an HTTP status code
type HTTPError struct {
    Status  int    `json:"status"`
    Code    string `json:"code"`
    Message string `json:"message"`
}

func (e *HTTPError) Error() string {
    return fmt.Sprintf("HTTP %d %s: %s", e.Status, e.Code, e.Message)
}

// Constructors for common cases
func NewNotFound(resource, id string) *HTTPError {
    return &HTTPError{
        Status:  http.StatusNotFound,
        Code:    "NOT_FOUND",
        Message: fmt.Sprintf("%s %q not found", resource, id),
    }
}

func NewBadRequest(msg string) *HTTPError {
    return &HTTPError{
        Status:  http.StatusBadRequest,
        Code:    "BAD_REQUEST",
        Message: msg,
    }
}

func NewUnauthorized() *HTTPError {
    return &HTTPError{
        Status:  http.StatusUnauthorized,
        Code:    "UNAUTHORIZED",
        Message: "authentication required",
    }
}

func NewForbidden() *HTTPError {
    return &HTTPError{
        Status:  http.StatusForbidden,
        Code:    "FORBIDDEN",
        Message: "insufficient permissions",
    }
}
```

A custom type lets you use `errors.As` to extract it in the centralised error handler.

## Error Wrapping: fmt.Errorf and %w

Wrapping with `%w` preserves the error chain. You can add context at each layer without losing the original error:

```go
func getUserByID(ctx context.Context, id int64) (*User, error) {
    user, err := db.QueryUserByID(ctx, id)
    if err != nil {
        return nil, fmt.Errorf("getUserByID id=%d: %w", id, err)
    }
    return user, nil
}

// In the service layer
func (s *UserService) GetProfile(ctx context.Context, id int64) (*Profile, error) {
    user, err := getUserByID(ctx, id)
    if err != nil {
        return nil, fmt.Errorf("GetProfile: %w", err)
    }
    // ...
}
```

Resulting chain: `GetProfile: getUserByID id=42: sql: no rows in result set`

The HTTP handler can then inspect the original type:

```go
if errors.Is(err, sql.ErrNoRows) {
    http.Error(w, "not found", http.StatusNotFound)
    return
}
```

## errors.Is and errors.As

**`errors.Is(err, target)`** — checks whether the error chain contains a specific value. Works with sentinel errors:

```go
var ErrUserNotFound = errors.New("user not found")

// In the repository
if rows == 0 {
    return nil, fmt.Errorf("queryUser: %w", ErrUserNotFound)
}

// In the handler
if errors.Is(err, ErrUserNotFound) {
    respond(w, http.StatusNotFound,
        map[string]string{"error": "user not found"})
    return
}
```

**`errors.As(err, &target)`** — extracts the first element in the chain of the given type:

```go
var httpErr *HTTPError
if errors.As(err, &httpErr) {
    respond(w, httpErr.Status, httpErr)
    return
}
```

Difference: `errors.Is` for specific values (sentinel errors), `errors.As` for types that carry data.

## Centralised Error Handler

An anti-pattern: different error handling in every HTTP handler. Better: a single function that translates any Go error into the appropriate HTTP response:

```go
func writeError(w http.ResponseWriter, r *http.Request, err error) {
    // 1. HTTPError with an explicit status
    var httpErr *HTTPError
    if errors.As(err, &httpErr) {
        respond(w, httpErr.Status, httpErr)
        return
    }

    // 2. Validation errors
    var validErr *ValidationError
    if errors.As(err, &validErr) {
        respond(w, http.StatusUnprocessableEntity, map[string]any{
            "status":  http.StatusUnprocessableEntity,
            "code":    "VALIDATION_ERROR",
            "errors":  validErr.Fields,
        })
        return
    }

    // 3. Known sentinel errors
    if errors.Is(err, ErrUserNotFound) {
        respond(w, http.StatusNotFound,
            map[string]string{"error": "user not found"})
        return
    }

    // 4. Everything else — 500, never expose details to the client
    slog.Error("unhandled error",
        "error", err,
        "path", r.URL.Path,
        "method", r.Method,
    )
    respond(w, http.StatusInternalServerError,
        map[string]string{"error": "internal server error"})
}
```

Handlers become clean:

```go
func (h *Handler) getUser(w http.ResponseWriter, r *http.Request) {
    id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
    if err != nil {
        writeError(w, r, NewBadRequest("invalid user id"))
        return
    }

    user, err := h.service.GetUser(r.Context(), id)
    if err != nil {
        writeError(w, r, err)
        return
    }

    respond(w, http.StatusOK, user)
}
```

## Validation Errors

Request validation is a distinct category. Clients need to know which specific fields are invalid:

```go
type FieldError struct {
    Field   string `json:"field"`
    Message string `json:"message"`
}

type ValidationError struct {
    Fields []FieldError `json:"fields"`
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation failed: %d field(s)", len(e.Fields))
}

func (e *ValidationError) Add(field, message string) {
    e.Fields = append(e.Fields, FieldError{Field: field, Message: message})
}

func (e *ValidationError) HasErrors() bool {
    return len(e.Fields) > 0
}

// Usage
func validateCreateUser(req CreateUserRequest) error {
    ve := &ValidationError{}

    if req.Name == "" {
        ve.Add("name", "name is required")
    }
    if len(req.Name) > 100 {
        ve.Add("name", "name must be at most 100 characters")
    }
    if !isValidEmail(req.Email) {
        ve.Add("email", "invalid email format")
    }
    if len(req.Password) < 8 {
        ve.Add("password", "password must be at least 8 characters")
    }

    if ve.HasErrors() {
        return ve
    }
    return nil
}
```

Client response:
```json
{
  "status": 422,
  "code": "VALIDATION_ERROR",
  "errors": [
    {"field": "email", "message": "invalid email format"},
    {"field": "password", "message": "password must be at least 8 characters"}
  ]
}
```

## Panic Recovery Middleware

A panic in a handler is an exceptional situation, but it must not crash the whole server. A middleware with `recover()` intercepts panics and returns 500:

```go
import "runtime/debug"

func RecoveryMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if rec := recover(); rec != nil {
                slog.Error("panic recovered",
                    "error", rec,
                    "stack", string(debug.Stack()),
                    "method", r.Method,
                    "path", r.URL.Path,
                )

                // Only write the 500 if headers haven't been sent yet
                if rw, ok := w.(interface{ Written() bool }); !ok || !rw.Written() {
                    http.Error(w, "internal server error",
                        http.StatusInternalServerError)
                }
            }
        }()
        next.ServeHTTP(w, r)
    })
}
```

Important: a panic is for truly exceptional conditions (nil pointer dereference, index out of bounds). Expected business-logic errors are returned as `error`, not panicked. Recovery middleware is a safety net, not the primary error-handling mechanism.

## Structured Errors and Codes

API clients — especially mobile apps — bind to machine-readable error codes, not to HTTP status numbers. Machine-readable codes let clients display the right localised message:

```go
const (
    CodeNotFound     = "NOT_FOUND"
    CodeUnauthorized = "UNAUTHORIZED"
    CodeForbidden    = "FORBIDDEN"
    CodeBadRequest   = "BAD_REQUEST"
    CodeValidation   = "VALIDATION_ERROR"
    CodeConflict     = "CONFLICT"
    CodeRateLimit    = "RATE_LIMIT_EXCEEDED"
    CodeInternal     = "INTERNAL_ERROR"
)

type ErrorResponse struct {
    Status  int    `json:"status"`
    Code    string `json:"code"`
    Message string `json:"message"`
    TraceID string `json:"trace_id,omitempty"`
}
```

Client receives:
```json
{
  "status": 404,
  "code": "NOT_FOUND",
  "message": "user \"42\" not found",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Idempotency and Retries

Server errors can be transient. Distinguish:
- **4xx** — client error, retrying is pointless (except 429 Too Many Requests).
- **5xx** — server error, safe to retry with exponential backoff.

For safe retry of insert/update operations, use an idempotency key: the client sends a unique `idempotency_key`, and the server checks whether it has already processed this request.

## Error Logging

Not all errors deserve the same log level:

```go
func writeError(w http.ResponseWriter, r *http.Request, err error) {
    var httpErr *HTTPError
    if errors.As(err, &httpErr) {
        // 4xx — warn (client's fault, expected)
        if httpErr.Status >= 400 && httpErr.Status < 500 {
            slog.Warn("client error",
                "status", httpErr.Status,
                "code", httpErr.Code,
                "path", r.URL.Path,
            )
        }
        respond(w, httpErr.Status, httpErr)
        return
    }

    // 5xx — error (unexpected, needs investigation)
    slog.Error("server error",
        "error", err,
        "path", r.URL.Path,
        "method", r.Method,
        "trace_id", traceIDFromContext(r.Context()),
    )
    respond(w, http.StatusInternalServerError,
        map[string]string{"error": "internal server error"})
}
```

Rule: do not log 4xx as Error — otherwise alerts will fire on client mistakes.

## Timeout and Context Errors

`context.DeadlineExceeded` is a specific server-error case. Handle it explicitly:

```go
func (h *Handler) slowEndpoint(w http.ResponseWriter, r *http.Request) {
    result, err := h.service.SlowOperation(r.Context())
    if err != nil {
        if errors.Is(err, context.DeadlineExceeded) ||
            errors.Is(err, context.Canceled) {
            http.Error(w, "request timeout", http.StatusGatewayTimeout)
            return
        }
        writeError(w, r, err)
        return
    }
    respond(w, http.StatusOK, result)
}
```

## Common Interview Questions

**What is the difference between `errors.Is` and `errors.As`?** `errors.Is` walks the chain comparing values — used for sentinel errors. `errors.As` walks the chain looking for a type match and writes it to the target — used for error types that carry data.

**Should you log an error at every layer?** No. Log once at the top level (in the HTTP handler). At lower levels only wrap with context. Otherwise one error appears in the logs five times.

**Is it ever correct to panic in a handler?** It is better to return an error. Panics are appropriate for programming errors (nil pointer, invariant violations), not business logic. Recovery middleware is a last-resort safety net.

## Summary

The error architecture of a Go server: custom types with HTTP status → wrap with `%w` at every layer → `errors.Is/As` in a centralised handler → differentiated logging → panic recovery middleware. This yields readable errors for the client, a full chain for the developer, and a resilient server that does not crash on unexpected situations.
