---
title: Design Patterns in Go
blockId: oop-patterns
parentBlockId: oop
---

# Design Patterns in Go

The GoF patterns (Gang of Four, 1994) were conceived for class-based languages. In Go they are implemented differently — without inheritance, and often more concisely. In an interview it is not enough to name a pattern; you need to show an idiomatic Go implementation.

## Functional Options

One of the most common Go patterns. It solves the problem of optional configuration parameters without multiple constructor overloads.

```go
type Server struct {
    addr         string
    timeout      time.Duration
    maxConns     int
    logger       *slog.Logger
    tlsConfig    *tls.Config
}

type Option func(*Server)

func WithTimeout(d time.Duration) Option {
    return func(s *Server) { s.timeout = d }
}

func WithMaxConnections(n int) Option {
    return func(s *Server) { s.maxConns = n }
}

func WithTLS(cfg *tls.Config) Option {
    return func(s *Server) { s.tlsConfig = cfg }
}

func WithLogger(l *slog.Logger) Option {
    return func(s *Server) { s.logger = l }
}

func NewServer(addr string, opts ...Option) *Server {
    s := &Server{
        addr:     addr,
        timeout:  30 * time.Second,
        maxConns: 100,
        logger:   slog.Default(),
    }
    for _, opt := range opts {
        opt(s)
    }
    return s
}

// usage
srv := NewServer(":8080",
    WithTimeout(60*time.Second),
    WithMaxConnections(500),
    WithLogger(myLogger),
)
```

Benefits: extensible without changing the signature (OCP), explicit defaults, readable call sites.

## Strategy — via Interfaces

Strategy lets you swap an algorithm at runtime without changing the code that uses it.

```go
type SortStrategy interface {
    Sort(data []int)
}

type QuickSort struct{}
func (q QuickSort) Sort(data []int) { /* quicksort */ }

type MergeSort struct{}
func (m MergeSort) Sort(data []int) { /* mergesort */ }

type Sorter struct {
    strategy SortStrategy
}

func (s *Sorter) SetStrategy(st SortStrategy) {
    s.strategy = st
}

func (s *Sorter) Sort(data []int) {
    s.strategy.Sort(data)
}

// or as a function — a lighter Strategy variant
type SortFunc func([]int)

type Pipeline struct {
    sort SortFunc
}

func NewPipeline(sortFn SortFunc) *Pipeline {
    return &Pipeline{sort: sortFn}
}
```

In Go, Strategy is often implemented not as an interface with a single method but as a plain `func(...)` — simpler and more idiomatic.

## Factory

A factory hides object-creation logic. In Go this is a plain constructor or factory function:

```go
type Notification interface {
    Send(to, message string) error
}

type EmailNotification struct{ smtpHost string }
type SMSNotification struct{ apiKey string }
type PushNotification struct{ firebaseKey string }

func (e *EmailNotification) Send(to, message string) error { /* ... */ return nil }
func (s *SMSNotification) Send(to, message string) error { /* ... */ return nil }
func (p *PushNotification) Send(to, message string) error { /* ... */ return nil }

type Channel string

const (
    ChannelEmail Channel = "email"
    ChannelSMS   Channel = "sms"
    ChannelPush  Channel = "push"
)

func NewNotification(ch Channel, cfg map[string]string) (Notification, error) {
    switch ch {
    case ChannelEmail:
        return &EmailNotification{smtpHost: cfg["smtp_host"]}, nil
    case ChannelSMS:
        return &SMSNotification{apiKey: cfg["api_key"]}, nil
    case ChannelPush:
        return &PushNotification{firebaseKey: cfg["firebase_key"]}, nil
    default:
        return nil, fmt.Errorf("unknown channel: %s", ch)
    }
}
```

## Singleton — via sync.OnceValue (Go 1.21+)

Singleton ensures a single instance. Go 1.21 added `sync.OnceValue`, which makes this elegant:

```go
import "sync"

type Config struct {
    DBUrl   string
    APIKey  string
}

var getConfig = sync.OnceValue(func() *Config {
    // expensive initialization — runs exactly once
    return &Config{
        DBUrl:  os.Getenv("DATABASE_URL"),
        APIKey: os.Getenv("API_KEY"),
    }
})

// use anywhere in the program
cfg := getConfig()
```

Go 1.25 retains `sync.OnceValue`. This is goroutine-safe: initialization runs exactly once even under concurrent calls.

Before Go 1.21, Singleton was implemented with `sync.Once`:

```go
var (
    instance *Config
    once     sync.Once
)

func GetConfig() *Config {
    once.Do(func() {
        instance = &Config{ /* ... */ }
    })
    return instance
}
```

Note: Singleton makes testing harder because it introduces global state. Dependency injection is usually preferable.

## Observer

The Observer pattern implements a subscription mechanism: an object notifies all subscribers of changes.

```go
type Event struct {
    Type    string
    Payload any
}

type Handler func(Event)

type EventBus struct {
    mu       sync.RWMutex
    handlers map[string][]Handler
}

func NewEventBus() *EventBus {
    return &EventBus{handlers: make(map[string][]Handler)}
}

func (eb *EventBus) Subscribe(eventType string, h Handler) {
    eb.mu.Lock()
    defer eb.mu.Unlock()
    eb.handlers[eventType] = append(eb.handlers[eventType], h)
}

func (eb *EventBus) Publish(e Event) {
    eb.mu.RLock()
    handlers := make([]Handler, len(eb.handlers[e.Type]))
    copy(handlers, eb.handlers[e.Type])
    eb.mu.RUnlock()

    for _, h := range handlers {
        h(e)
    }
}

// usage
bus := NewEventBus()

bus.Subscribe("user.created", func(e Event) {
    fmt.Println("sending welcome email:", e.Payload)
})

bus.Subscribe("user.created", func(e Event) {
    fmt.Println("creating analytics record:", e.Payload)
})

bus.Publish(Event{Type: "user.created", Payload: "user@example.com"})
```

In concurrent code, channels are often used instead of function handlers:

```go
type EventBusChan struct {
    subscribers map[string][]chan Event
    // ...
}
```

## Decorator / Middleware

Decorator wraps an object and adds behavior without modifying the original code. In Go this is particularly elegant for HTTP handlers and functions.

```go
// decorator for http.Handler
func Logging(logger *slog.Logger, next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        logger.Info("request", "method", r.Method, "path", r.URL.Path)
        next.ServeHTTP(w, r)
        logger.Info("done", "duration", time.Since(start))
    })
}

func Recovery(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if err := recover(); err != nil {
                http.Error(w, "Internal Server Error", http.StatusInternalServerError)
            }
        }()
        next.ServeHTTP(w, r)
    })
}

// decorator chain
handler := Logging(logger, Recovery(myHandler))
```

Decorator for arbitrary functions:

```go
type QueryFunc func(ctx context.Context, query string) ([]Row, error)

func WithMetrics(fn QueryFunc, histogram metrics.Histogram) QueryFunc {
    return func(ctx context.Context, query string) ([]Row, error) {
        start := time.Now()
        rows, err := fn(ctx, query)
        histogram.Observe(time.Since(start).Seconds())
        return rows, err
    }
}
```

## Builder

Builder is useful when an object is constructed step by step and the result should be immutable.

```go
type Query struct {
    table      string
    conditions []string
    orderBy    string
    limit      int
    offset     int
}

type QueryBuilder struct {
    q Query
}

func NewQuery(table string) *QueryBuilder {
    return &QueryBuilder{q: Query{table: table}}
}

func (b *QueryBuilder) Where(condition string) *QueryBuilder {
    b.q.conditions = append(b.q.conditions, condition)
    return b
}

func (b *QueryBuilder) OrderBy(field string) *QueryBuilder {
    b.q.orderBy = field
    return b
}

func (b *QueryBuilder) Limit(n int) *QueryBuilder {
    b.q.limit = n
    return b
}

func (b *QueryBuilder) Offset(n int) *QueryBuilder {
    b.q.offset = n
    return b
}

func (b *QueryBuilder) Build() (string, error) {
    if b.q.table == "" {
        return "", errors.New("table name is required")
    }
    sql := "SELECT * FROM " + b.q.table
    if len(b.q.conditions) > 0 {
        sql += " WHERE " + strings.Join(b.q.conditions, " AND ")
    }
    if b.q.orderBy != "" {
        sql += " ORDER BY " + b.q.orderBy
    }
    if b.q.limit > 0 {
        sql += fmt.Sprintf(" LIMIT %d", b.q.limit)
    }
    return sql, nil
}

// usage
q, err := NewQuery("users").
    Where("age > 18").
    Where("active = true").
    OrderBy("created_at DESC").
    Limit(10).
    Build()
```

## Anti-patterns

**Anemic Domain Model.** Structs hold only data; all logic lives in services. Violates OCP and SRP. Prefer putting methods directly on structs.

**Interface for everything.** Creating an interface for every struct "just in case" adds complexity with no benefit. Interfaces belong where there are multiple implementations or a need for test doubles.

**God Object.** A single type or package with too broad a responsibility. Break it into smaller, specialized parts.

**init() for configuration.** Using `init()` to initialize dependencies makes testing difficult. Prefer explicit constructors.

**Singleton everywhere.** Global state via Singletons makes code hard to test. Use dependency injection.

## Pattern Selection Reference

| Problem | Pattern |
|---|---|
| Flexible object configuration | Functional Options |
| Swappable algorithms | Strategy |
| Creating objects by type | Factory |
| Single instance | sync.OnceValue |
| Reacting to events | Observer |
| Adding behavior without modifying code | Decorator / Middleware |
| Step-by-step construction of a complex object | Builder |
