---
title: Testing Go Servers
blockId: server-testing
parentBlockId: server
---

# Testing Go Servers

Testing is a first-class concern in Go's ecosystem. The `testing` package is built in, `httptest` lets you test HTTP handlers without a real network connection, and Go 1.24 added `t.Context()` and `b.Loop()` that reduce boilerplate in tests and benchmarks. In technical interviews, server testing is often explored through hands-on tasks and architectural discussions.

## httptest.NewRecorder: Handler Unit Tests

`httptest.ResponseRecorder` is an `http.ResponseWriter` that captures everything written to it: status code, headers, and body. It is the right tool for testing a single handler in complete isolation:

```go
import (
    "net/http"
    "net/http/httptest"
    "testing"
)

func TestHealthHandler(t *testing.T) {
    req := httptest.NewRequest(http.MethodGet, "/health", nil)
    w := httptest.NewRecorder()

    HealthHandler(w, req)

    res := w.Result()
    defer res.Body.Close()

    if res.StatusCode != http.StatusOK {
        t.Errorf("got status %d, want %d", res.StatusCode, http.StatusOK)
    }
}
```

What to assert:
- `w.Code` — the status code (equivalent to `res.StatusCode`).
- `w.Body.String()` — the response body as a string.
- `w.Header()` — the response headers.
- `w.Result()` — the full `*http.Response` for more complex assertions.

## t.Context() in Go 1.24

Before Go 1.24, every test that needed a cancellable context required boilerplate:

```go
// Old style (pre Go 1.24)
ctx, cancel := context.WithCancel(context.Background())
defer cancel()
req = req.WithContext(ctx)
```

Since Go 1.24, `t.Context()` returns a context that is automatically cancelled when the test ends (including cleanup registered with `t.Cleanup`):

```go
func TestGetUser(t *testing.T) {
    req := httptest.NewRequest(http.MethodGet, "/api/users/42", nil).
        WithContext(t.Context()) // cancelled when the test finishes

    w := httptest.NewRecorder()
    handler.getUser(w, req)

    if w.Code != http.StatusOK {
        t.Errorf("got %d, want %d", w.Code, http.StatusOK)
    }
}
```

This is especially useful for tests involving goroutines or long-running operations — no need to think about cleanup.

## Table-Driven Tests

The idiomatic Go pattern for covering multiple scenarios:

```go
func TestCreateUser(t *testing.T) {
    tests := []struct {
        name       string
        body       string
        wantStatus int
        wantCode   string
    }{
        {
            name:       "valid request",
            body:       `{"name":"Alice","email":"alice@example.com","password":"secret123"}`,
            wantStatus: http.StatusCreated,
        },
        {
            name:       "missing name",
            body:       `{"email":"alice@example.com","password":"secret123"}`,
            wantStatus: http.StatusUnprocessableEntity,
            wantCode:   "VALIDATION_ERROR",
        },
        {
            name:       "invalid email",
            body:       `{"name":"Alice","email":"not-an-email","password":"secret123"}`,
            wantStatus: http.StatusUnprocessableEntity,
            wantCode:   "VALIDATION_ERROR",
        },
        {
            name:       "empty body",
            body:       `{}`,
            wantStatus: http.StatusUnprocessableEntity,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            body := strings.NewReader(tt.body)
            req := httptest.NewRequest(http.MethodPost, "/api/users", body).
                WithContext(t.Context())
            req.Header.Set("Content-Type", "application/json")

            w := httptest.NewRecorder()
            handler.createUser(w, req)

            if w.Code != tt.wantStatus {
                t.Errorf("status: got %d, want %d\nbody: %s",
                    w.Code, tt.wantStatus, w.Body.String())
            }

            if tt.wantCode != "" {
                var resp map[string]any
                if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
                    t.Fatalf("unmarshal response: %v", err)
                }
                if got := resp["code"]; got != tt.wantCode {
                    t.Errorf("code: got %v, want %v", got, tt.wantCode)
                }
            }
        })
    }
}
```

## Mocking with Interfaces

Dependencies (database, external services) should be isolated behind interfaces:

```go
// Repository interface
type UserRepository interface {
    GetByID(ctx context.Context, id int64) (*User, error)
    Create(ctx context.Context, u *User) error
    Update(ctx context.Context, u *User) error
    Delete(ctx context.Context, id int64) error
}

// Test mock
type mockUserRepo struct {
    getByID func(ctx context.Context, id int64) (*User, error)
    create  func(ctx context.Context, u *User) error
}

func (m *mockUserRepo) GetByID(ctx context.Context, id int64) (*User, error) {
    if m.getByID != nil {
        return m.getByID(ctx, id)
    }
    return nil, nil
}

func (m *mockUserRepo) Create(ctx context.Context, u *User) error {
    if m.create != nil {
        return m.create(ctx, u)
    }
    return nil
}

func (m *mockUserRepo) Update(_ context.Context, _ *User) error  { return nil }
func (m *mockUserRepo) Delete(_ context.Context, _ int64) error { return nil }

// Test using the mock
func TestGetUserHandler_NotFound(t *testing.T) {
    repo := &mockUserRepo{
        getByID: func(ctx context.Context, id int64) (*User, error) {
            return nil, ErrUserNotFound
        },
    }
    h := NewHandler(repo, slog.Default())

    req := httptest.NewRequest(http.MethodGet, "/api/users/99", nil).
        WithContext(t.Context())
    // Set path value manually — available since Go 1.22
    req.SetPathValue("id", "99")

    w := httptest.NewRecorder()
    h.getUser(w, req)

    if w.Code != http.StatusNotFound {
        t.Errorf("got %d, want %d", w.Code, http.StatusNotFound)
    }
}
```

Note: `req.SetPathValue("id", "99")` is available since Go 1.22 and lets you simulate path variables without a real `ServeMux`.

## httptest.NewServer: Integration Tests

For testing client-server behaviour or verifying HTTP clients, use a real test server:

```go
func TestAPIIntegration(t *testing.T) {
    mux := http.NewServeMux()
    mux.HandleFunc("GET /api/users/{id}", handler.getUser)
    mux.HandleFunc("POST /api/users", handler.createUser)

    ts := httptest.NewServer(mux)
    defer ts.Close()

    client := ts.Client()

    t.Run("create and retrieve user", func(t *testing.T) {
        body := `{"name":"Bob","email":"bob@example.com","password":"pass1234"}`
        resp, err := client.Post(
            ts.URL+"/api/users",
            "application/json",
            strings.NewReader(body),
        )
        if err != nil {
            t.Fatalf("POST /api/users: %v", err)
        }
        defer resp.Body.Close()

        if resp.StatusCode != http.StatusCreated {
            t.Errorf("create: got %d, want %d", resp.StatusCode, http.StatusCreated)
        }

        var created User
        json.NewDecoder(resp.Body).Decode(&created)

        resp2, err := client.Get(
            fmt.Sprintf("%s/api/users/%d", ts.URL, created.ID))
        if err != nil {
            t.Fatalf("GET /api/users/%d: %v", created.ID, err)
        }
        defer resp2.Body.Close()

        if resp2.StatusCode != http.StatusOK {
            t.Errorf("get: got %d, want %d", resp2.StatusCode, http.StatusOK)
        }
    })
}
```

`httptest.NewTLSServer` — the HTTPS variant for testing TLS-specific logic.

## testcontainers: Real Database in Tests

For integration tests that require a real database, `testcontainers-go` starts a Docker container directly inside the test:

```go
import (
    "github.com/testcontainers/testcontainers-go"
    "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestWithRealDB(t *testing.T) {
    ctx := t.Context()

    pgContainer, err := postgres.Run(ctx,
        "postgres:16",
        postgres.WithDatabase("testdb"),
        postgres.WithUsername("test"),
        postgres.WithPassword("test"),
        testcontainers.WithWaitStrategy(
            wait.ForLog("database system is ready to accept connections").
                WithOccurrence(2),
        ),
    )
    if err != nil {
        t.Fatalf("start postgres: %v", err)
    }
    t.Cleanup(func() {
        pgContainer.Terminate(ctx)
    })

    connStr, _ := pgContainer.ConnectionString(ctx, "sslmode=disable")
    db, err := sql.Open("postgres", connStr)
    if err != nil {
        t.Fatalf("open db: %v", err)
    }
    defer db.Close()

    repo := NewUserRepository(db)
    runMigrations(db)

    user := &User{Name: "Alice", Email: "alice@test.com"}
    if err := repo.Create(ctx, user); err != nil {
        t.Fatalf("create user: %v", err)
    }

    found, err := repo.GetByID(ctx, user.ID)
    if err != nil {
        t.Fatalf("get user: %v", err)
    }
    if found.Email != user.Email {
        t.Errorf("email: got %q, want %q", found.Email, user.Email)
    }
}
```

Note: testcontainers requires Docker. Make sure Docker is available in your CI environment.

## Golden Files: Snapshot Testing

For testing complex JSON responses, golden files store the expected output that was verified once and is checked on every test run:

```go
func TestUserResponseGolden(t *testing.T) {
    req := httptest.NewRequest(http.MethodGet, "/api/users/1", nil).
        WithContext(t.Context())
    w := httptest.NewRecorder()
    handler.getUser(w, req)

    got := w.Body.Bytes()

    goldenPath := filepath.Join("testdata", t.Name()+".golden.json")

    // Update golden file: go test -update
    if *update {
        os.MkdirAll("testdata", 0755)
        os.WriteFile(goldenPath, got, 0644)
        return
    }

    want, err := os.ReadFile(goldenPath)
    if err != nil {
        t.Fatalf("read golden file %s: %v\nRun with -update to create it",
            goldenPath, err)
    }

    if !bytes.Equal(got, want) {
        t.Errorf("response mismatch:\ngot:  %s\nwant: %s", got, want)
    }
}

var update = flag.Bool("update", false, "update golden files")
```

Golden files are especially convenient for endpoints with large, complex JSON responses where writing the expected output by hand would be tedious.

## Benchmarks with b.Loop() in Go 1.24

Before Go 1.24, benchmarks used `for range b.N`. Go 1.24 introduces `b.Loop()` — a method that returns `true` as long as the benchmark should continue, and correctly excludes setup time from the measurement:

```go
func BenchmarkHandlerJSON(b *testing.B) {
    body := `{"name":"Alice","email":"alice@example.com","password":"pass123"}`
    handler := NewHandler(newTestRepo(), slog.Default())

    b.ResetTimer()

    for b.Loop() {  // Go 1.24: replaces for range b.N
        req := httptest.NewRequest(http.MethodPost, "/api/users",
            strings.NewReader(body))
        req.Header.Set("Content-Type", "application/json")
        w := httptest.NewRecorder()

        handler.createUser(w, req)

        if w.Code != http.StatusCreated {
            b.Fatalf("unexpected status %d", w.Code)
        }
    }
}
```

Run: `go test -bench=BenchmarkHandlerJSON -benchmem -count=5`

`-benchmem` adds allocation statistics (allocs/op, B/op).

## Parallel Tests

Marking a test with `t.Parallel()` allows it to run concurrently with other parallel tests:

```go
func TestHandlers(t *testing.T) {
    t.Parallel()

    tests := []struct {
        name string
        // ...
    }{
        // ...
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            t.Parallel()
            // test body...
        })
    }
}
```

Since Go 1.22, loop variables are per-iteration, so there is no need for the old `tt := tt` capture trick in parallel subtests.

## Test File Structure

Recommended package layout:

```
handlers/
├── handler.go          # production code
├── handler_test.go     # unit tests (package handlers)
├── integration_test.go # integration tests (package handlers_test)
└── testdata/
    ├── fixtures/       # test data (JSON, SQL)
    └── golden/         # golden files
```

The `handlers_test` package (with `_test` suffix) tests only the public API — preferred for integration tests. The `handlers` package (without suffix) has access to private methods — useful for unit tests of internal logic.

## Test Helpers and t.Helper

For repeated assertion logic, use helpers annotated with `t.Helper()`:

```go
func assertStatus(t *testing.T, got, want int) {
    t.Helper() // this call does not appear in the error trace
    if got != want {
        t.Errorf("status: got %d, want %d", got, want)
    }
}

func assertJSON(t *testing.T, body *bytes.Buffer, v any) {
    t.Helper()
    if err := json.Unmarshal(body.Bytes(), v); err != nil {
        t.Fatalf("unmarshal response: %v\nbody: %s", err, body.String())
    }
}

// Usage
func TestGetUser(t *testing.T) {
    w := httptest.NewRecorder()
    handler.getUser(w, req)

    assertStatus(t, w.Code, http.StatusOK)

    var user User
    assertJSON(t, w.Body, &user)

    if user.ID != 42 {
        t.Errorf("ID: got %d, want 42", user.ID)
    }
}
```

## Common Interview Questions

**What is the difference between `httptest.NewRecorder` and `httptest.NewServer`?** Recorder is in-process — no real TCP socket. NewServer starts a real HTTP server on localhost. Use Recorder for handler unit tests; use NewServer for integration tests or for testing HTTP clients.

**How do you test middleware?** Middleware accepts and returns an `http.Handler`. In a test, pass a mock handler that records whether it was called, then assert the middleware's behaviour (header set, early return on invalid auth, etc.).

**When should you use testcontainers?** When the test verifies real SQL queries, database migrations, or behaviour specific to a particular database engine. Not needed when you can mock the repository interface.

**What is `b.Loop()` and why is it better than `for range b.N`?** `b.Loop()` is a new method in Go 1.24. Unlike `for range b.N`, it correctly handles cases where setup before the measured operation is non-trivial, and does not include that setup time in the reported result.

## Summary

Comprehensive Go server testing uses several layers: handler unit tests with `httptest.NewRecorder`, integration tests with `httptest.NewServer`, real-database tests via testcontainers, golden files for snapshot assertions, and benchmarks with `b.Loop()`. `t.Context()` (Go 1.24) eliminates the boilerplate of manual context management. Each layer covers a different aspect of correctness, and together they provide high confidence in server behaviour.
