---
title: SOLID in Go
blockId: oop-solid
parentBlockId: oop
---

# SOLID in Go

SOLID is a set of five object-oriented design principles formulated by Robert Martin. In class-based languages they are usually illustrated through inheritance hierarchies. In Go they are expressed through packages, interfaces, and constructors. Understanding how SOLID translates without classes is a common interview topic for Go teams.

## S — Single Responsibility Principle

**Definition:** a module should have one and only one reason to change.

In Go the unit of responsibility is the **package**. A good package does one thing and does it well. A common mistake is a monolithic `util` or `helpers` package that grows to absorb unrelated code over time.

Violation:

```go
// package order — does too much
package order

func CreateOrder(userID int64, items []Item) (*Order, error) { ... }
func SendConfirmationEmail(order *Order) error { ... }   // email logic
func SaveOrderToDB(order *Order) error { ... }           // persistence
func GenerateInvoicePDF(order *Order) []byte { ... }    // PDF generation
```

Compliance:

```go
// package order — only business logic
package order

func New(userID int64, items []Item) (*Order, error) { ... }
func (o *Order) TotalPrice() float64 { ... }

// package notify — only notifications
package notify

func SendOrderConfirmation(email string, order *order.Order) error { ... }

// package storage — only persistence
package storage

func SaveOrder(ctx context.Context, order *order.Order) error { ... }
```

Each package now changes for its own reason: `order` when business rules change, `notify` when the email provider changes, `storage` when the database migrates.

At the type level, SRP means keeping structs small with clearly defined responsibilities:

```go
// bad: one struct knows too much
type UserService struct {
    db        *sql.DB
    cache     *redis.Client
    emailSMTP string
    logger    *slog.Logger
}

// better: split into specialized types
type UserRepo struct{ db *sql.DB }
type UserCache struct{ client *redis.Client }
type UserNotifier struct{ smtp string }
```

## O — Open/Closed Principle

**Definition:** a software entity should be open for extension, but closed for modification.

In Go this is achieved through interfaces. A function that accepts an interface accepts any future type without any change to its own code.

```go
type Exporter interface {
    Export(data []byte) error
}

type ReportService struct {
    exporter Exporter
}

func (s *ReportService) GenerateReport(data []byte) error {
    // report generation logic
    return s.exporter.Export(data)
}
```

Adding support for a new export format does not mean modifying `ReportService` — just implement a new type:

```go
type CSVExporter struct{ path string }
func (e *CSVExporter) Export(data []byte) error { ... }

type S3Exporter struct{ bucket string }
func (e *S3Exporter) Export(data []byte) error { ... }

type SlackExporter struct{ webhook string }
func (e *SlackExporter) Export(data []byte) error { ... }
```

`ReportService` is closed for modification but open for extension through new `Exporter` implementations.

Another idiomatic tool is the **Functional Options** pattern. New configuration parameters are added without changing the constructor signature:

```go
type Server struct {
    addr      string
    timeout   time.Duration
    logger    *slog.Logger
    maxConns  *int          // pointer: nil = unlimited
}

type Option func(*Server)

func WithTimeout(d time.Duration) Option {
    return func(s *Server) { s.timeout = d }
}

func WithLogger(l *slog.Logger) Option {
    return func(s *Server) { s.logger = l }
}

func WithMaxConns(n int) Option {
    // Go 1.26: new(n) returns a *int without a temp variable
    return func(s *Server) { s.maxConns = new(n) }
}

func NewServer(addr string, opts ...Option) *Server {
    s := &Server{addr: addr, timeout: 30 * time.Second}
    for _, opt := range opts {
        opt(s)
    }
    return s
}

srv := NewServer(":8080", WithTimeout(60*time.Second), WithLogger(myLogger), WithMaxConns(500))
```

## L — Liskov Substitution Principle

**Definition:** if `S` is a subtype of `T`, then objects of type `T` may be replaced with objects of type `S` without altering any desirable properties of the program.

In Go this means: an interface implementation must respect the **semantic contract** of the interface, not just its signature.

```go
type Cache interface {
    Get(key string) ([]byte, bool)
    Set(key string, value []byte, ttl time.Duration)
}

// Correct — respects the contract
type MemoryCache struct{ mu sync.RWMutex; items map[string]item }

func (c *MemoryCache) Get(key string) ([]byte, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()
    it, ok := c.items[key]
    if !ok || time.Now().After(it.expiresAt) {
        return nil, false
    }
    return it.value, true
}

// LSP violation — panics under certain conditions
type BrokenCache struct{}

func (c *BrokenCache) Get(key string) ([]byte, bool) {
    panic("not implemented") // violates the contract: Get must not panic
}
```

Practical rule: an interface implementation must not narrow behavior — it must not panic where the contract says return an error, ignore parameters, or return nil where a value is expected.

In Go 1.26 you can verify interface compliance statically at compile time:

```go
var _ Cache = (*MemoryCache)(nil)  // compiler error if the type does not implement Cache
```

## I — Interface Segregation Principle

**Definition:** a client should not be forced to depend on methods it does not use.

This is perhaps the principle Go implements most elegantly. Small single- or two-method interfaces are a Go idiom.

Violation — a fat interface:

```go
// bad: everything in one interface
type FileSystem interface {
    Read(path string) ([]byte, error)
    Write(path string, data []byte) error
    Delete(path string) error
    ListDir(path string) ([]string, error)
    MakeDir(path string) error
    Stat(path string) (os.FileInfo, error)
}
```

A function that only needs to read files is forced to depend on the entire `FileSystem`. Segregate:

```go
// good: small role-specific interfaces
type FileReader interface {
    Read(path string) ([]byte, error)
}

type FileWriter interface {
    Write(path string, data []byte) error
}

type DirLister interface {
    ListDir(path string) ([]string, error)
}

// compose only where truly needed
type ReadWriter interface {
    FileReader
    FileWriter
}
```

Now a function that only needs `FileReader` does not carry a dependency on write and delete operations:

```go
func CountLines(r FileReader, path string) (int, error) {
    data, err := r.Read(path)
    if err != nil {
        return 0, err
    }
    return bytes.Count(data, []byte("\n")), nil
}
```

Testing becomes trivial — the mock for `FileReader` is minimal:

```go
type mockReader struct{ content []byte }
func (m *mockReader) Read(_ string) ([]byte, error) { return m.content, nil }
```

## D — Dependency Inversion Principle

**Definition:** high-level modules should not depend on low-level modules; both should depend on abstractions.

In Go the abstraction is an interface. DIP is implemented via **constructor injection**.

Violation — direct dependency on a concrete type:

```go
// bad: OrderService directly depends on PostgresOrderRepo
type OrderService struct {
    repo *PostgresOrderRepo  // concrete type
}

func NewOrderService() *OrderService {
    return &OrderService{repo: NewPostgresOrderRepo()}
}
```

Compliance — dependency on an abstraction:

```go
// good: depends on an interface
type OrderRepository interface {
    Save(ctx context.Context, order *Order) error
    FindByID(ctx context.Context, id int64) (*Order, error)
}

type OrderService struct {
    repo OrderRepository  // abstraction
}

func NewOrderService(repo OrderRepository) *OrderService {
    return &OrderService{repo: repo}
}
```

`OrderService` no longer knows what backs `OrderRepository` — Postgres, SQLite, an in-memory implementation for tests, or a mock. The constructor receives the dependency from outside.

Full example with a test:

```go
// production
pgRepo := postgres.NewOrderRepo(db)
svc := order.NewOrderService(pgRepo)

// test
type mockRepo struct{ orders map[int64]*Order }
func (m *mockRepo) Save(_ context.Context, o *Order) error {
    m.orders[o.ID] = o
    return nil
}
func (m *mockRepo) FindByID(_ context.Context, id int64) (*Order, error) {
    o, ok := m.orders[id]
    if !ok {
        return nil, ErrNotFound
    }
    return o, nil
}

svc := order.NewOrderService(&mockRepo{orders: make(map[int64]*Order)})
```

Dependency injection in depth — constructor, Wire, fx — is covered in the "DI in Go" article.

## SOLID and Idiomatic Go

| Principle | Go Tool |
|---|---|
| SRP | Small packages with a single responsibility |
| OCP | Interfaces + Functional Options |
| LSP | Semantic interface contracts |
| ISP | Small interfaces (1–2 methods) |
| DIP | Constructor injection through an interface |

All five principles are expressed concisely in Go — often more concisely than in Java or C#. This is because implicit interface satisfaction eliminates declaration boilerplate and allows interfaces to be defined on the consumer side rather than the producer side.
