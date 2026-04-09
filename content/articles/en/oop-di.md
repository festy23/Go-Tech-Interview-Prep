---
title: Dependency Injection in Go
blockId: oop-di
parentBlockId: oop
---

# Dependency Injection in Go

Dependency Injection (DI) is a pattern in which an object receives its dependencies from the outside rather than creating them itself. In frameworks-heavy ecosystems (Spring in Java, Symfony in PHP) DI containers are taken for granted. Go follows a different philosophy: **explicit code over magic**. Most Go projects manage with constructor DI and no framework at all.

## What Is a Dependency and Why Inject It

A dependency is any external resource or service your code relies on: a database, HTTP client, logger, file system, external API.

Without DI:

```go
type OrderService struct{}

func (s *OrderService) CreateOrder(userID int64) error {
    db, _ := sql.Open("postgres", os.Getenv("DATABASE_URL")) // created here
    // ...
    return nil
}
```

Problems: cannot be substituted in tests, difficult to reconfigure, every call opens a new database connection.

With DI:

```go
type OrderService struct {
    db     *sql.DB
    logger *slog.Logger
}

func NewOrderService(db *sql.DB, logger *slog.Logger) *OrderService {
    return &OrderService{db: db, logger: logger}
}
```

Dependencies are now passed at construction time — once, explicitly.

## Constructor DI — the Primary Pattern

Constructor injection is the dominant approach in Go. All dependencies are passed to a `New...` constructor:

```go
// Repository layer
type UserRepository interface {
    FindByID(ctx context.Context, id int64) (*User, error)
    Save(ctx context.Context, user *User) error
}

type postgresUserRepo struct {
    db *sql.DB
}

func NewUserRepository(db *sql.DB) UserRepository {
    return &postgresUserRepo{db: db}
}

func (r *postgresUserRepo) FindByID(ctx context.Context, id int64) (*User, error) {
    var u User
    err := r.db.QueryRowContext(ctx,
        "SELECT id, name, email FROM users WHERE id = $1", id,
    ).Scan(&u.ID, &u.Name, &u.Email)
    if err != nil {
        return nil, fmt.Errorf("find user %d: %w", id, err)
    }
    return &u, nil
}

// Service layer
type UserService struct {
    repo   UserRepository
    mailer Mailer
    logger *slog.Logger
}

func NewUserService(repo UserRepository, mailer Mailer, logger *slog.Logger) *UserService {
    return &UserService{repo: repo, mailer: mailer, logger: logger}
}

func (s *UserService) GetUser(ctx context.Context, id int64) (*User, error) {
    s.logger.Info("fetching user", "id", id)
    return s.repo.FindByID(ctx, id)
}

// Handler layer
type UserHandler struct {
    svc *UserService
}

func NewUserHandler(svc *UserService) *UserHandler {
    return &UserHandler{svc: svc}
}
```

## Assembling in main()

The entire dependency graph is wired manually in `main()`:

```go
func main() {
    // infrastructure
    db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()

    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
    mailer := email.NewSMTPMailer(os.Getenv("SMTP_HOST"))

    // layer assembly
    userRepo    := NewUserRepository(db)
    userService := NewUserService(userRepo, mailer, logger)
    userHandler := NewUserHandler(userService)

    // HTTP server
    mux := http.NewServeMux()
    mux.HandleFunc("GET /users/{id}", userHandler.Get)

    log.Fatal(http.ListenAndServe(":8080", mux))
}
```

This is the **Composition Root** — the single place where the entire dependency graph is assembled. For small and medium applications this is optimal: everything is explicit, easy to read, easy to debug.

## Interface-based DI and Testing

The primary value of interface DI is testability. A mock takes just a few lines:

```go
// file: user_service_test.go

type mockUserRepo struct {
    users map[int64]*User
    err   error
}

func (m *mockUserRepo) FindByID(_ context.Context, id int64) (*User, error) {
    if m.err != nil {
        return nil, m.err
    }
    u, ok := m.users[id]
    if !ok {
        return nil, ErrNotFound
    }
    return u, nil
}

func (m *mockUserRepo) Save(_ context.Context, u *User) error {
    m.users[u.ID] = u
    return m.err
}

func TestGetUser_Success(t *testing.T) {
    repo := &mockUserRepo{
        users: map[int64]*User{
            1: {ID: 1, Name: "Alice", Email: "alice@example.com"},
        },
    }
    svc := NewUserService(repo, &mockMailer{}, slog.Default())

    user, err := svc.GetUser(context.Background(), 1)
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if user.Name != "Alice" {
        t.Errorf("got %q, want %q", user.Name, "Alice")
    }
}

func TestGetUser_NotFound(t *testing.T) {
    repo := &mockUserRepo{users: map[int64]*User{}}
    svc := NewUserService(repo, &mockMailer{}, slog.Default())

    _, err := svc.GetUser(context.Background(), 999)
    if !errors.Is(err, ErrNotFound) {
        t.Errorf("expected ErrNotFound, got %v", err)
    }
}
```

The test uses no real database. Execution time: microseconds.

## Wire — Code-generated Dependency Graph

As an application grows, the manual `main()` assembly grows with it. Google Wire solves this through **code generation** — you describe "providers" (constructors) and Wire generates the wiring code.

Installation:

```bash
go install github.com/google/wire/cmd/wire@latest
```

Providers (plain constructors):

```go
// file: providers.go

func NewDB(cfg *Config) (*sql.DB, error) {
    return sql.Open("postgres", cfg.DatabaseURL)
}

func NewLogger() *slog.Logger {
    return slog.New(slog.NewJSONHandler(os.Stdout, nil))
}

// provider set: grouping providers
var UserSet = wire.NewSet(
    NewUserRepository,
    NewUserService,
    NewUserHandler,
)
```

Wire injector (description of what you want):

```go
// file: wire.go — only for code generation, not compiled into the binary

//go:build wireinject

package main

import "github.com/google/wire"

func InitializeApp(cfg *Config) (*App, error) {
    wire.Build(
        NewDB,
        NewLogger,
        email.NewSMTPMailer,
        UserSet,
        NewApp,
    )
    return nil, nil  // Wire replaces this with generated code
}
```

After running `wire gen`, a `wire_gen.go` file with real initialization code appears in the package.

Wire uses no runtime reflection — only code generation. This means: zero runtime overhead, compiler type checks, no magic.

## fx — Uber's DI Container

`go.uber.org/fx` is a more fully-featured DI container. Unlike Wire, fx operates at runtime through reflection.

```go
import "go.uber.org/fx"

func main() {
    app := fx.New(
        fx.Provide(
            NewDB,
            NewLogger,
            NewUserRepository,
            NewUserService,
            NewUserHandler,
        ),
        fx.Invoke(func(handler *UserHandler, lc fx.Lifecycle) {
            lc.Append(fx.Hook{
                OnStart: func(ctx context.Context) error {
                    go http.ListenAndServe(":8080", handler.Mux())
                    return nil
                },
                OnStop: func(ctx context.Context) error {
                    return handler.Shutdown(ctx)
                },
            })
        }),
    )
    app.Run()
}
```

fx automatically manages lifecycle (lifecycle hooks), startup and shutdown order. It suits large applications with complex initialization ordering.

When to use fx vs Wire:

| | Wire | fx |
|---|---|---|
| Type | Code generation | Runtime |
| Performance | Zero overhead | Small (reflection at startup) |
| Lifecycle hooks | No | Yes |
| Application size | Small / medium | Medium / large |
| Transparency | High (read the generated code) | Medium |

## Why Go Doesn't Need DI Frameworks

In Java, the Spring DI container is popular partly because without it, initializing a complex dependency graph becomes pages of boilerplate. In Go, manual assembly stays manageable for several reasons:

1. **No XML or annotations.** No container configuration overhead.
2. **Compiler type checks.** No runtime "bean not found" errors.
3. **Explicitness is valued.** Go culture: "explicit is better than implicit."
4. **Interfaces are cheap.** Creating a test mock takes a few lines of code.

For most projects the recipe is simple: constructors + interfaces + `main()` as the Composition Root. Add Wire when the dependency graph grows large. Add fx when you need lifecycle hooks or your team has significant DI-container experience.

## Summary

| Approach | When to Use |
|---|---|
| Manual constructor DI | Always, as the baseline approach |
| Wire | The graph has grown large and tangled |
| fx | Lifecycle hooks needed; large-scale service |
| Global variables | Never (except `var log = slog.Default()`) |
