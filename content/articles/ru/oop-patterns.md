---
title: Паттерны проектирования в Go
blockId: oop-patterns
parentBlockId: oop
---

# Паттерны проектирования в Go

Паттерны из книги GoF (Gang of Four, 1994) были придуманы для языков с классами. В Go они реализуются иначе — без наследования и нередко более лаконично. На собеседовании важно не просто назвать паттерн, но и показать идиоматичную реализацию на Go.

## Functional Options

Один из самых распространённых Go-паттернов. Решает проблему опциональных параметров конфигурации без множества перегрузок конструктора.

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

// использование
srv := NewServer(":8080",
    WithTimeout(60*time.Second),
    WithMaxConnections(500),
    WithLogger(myLogger),
)
```

Преимущества: расширяемость без изменения сигнатуры (принцип OCP), явные значения по умолчанию, легко читается.

## Strategy — стратегия через интерфейсы

Strategy позволяет менять алгоритм во время выполнения без изменения кода, который его использует.

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

// или через функцию — более лёгкий вариант стратегии
type SortFunc func([]int)

type Pipeline struct {
    sort SortFunc
}

func NewPipeline(sortFn SortFunc) *Pipeline {
    return &Pipeline{sort: sortFn}
}
```

В Go стратегия часто реализуется не через интерфейс с одним методом, а через функцию `func(...)` — это проще и Go-идиоматично.

## Factory — фабрика

Фабрика скрывает логику создания объектов. В Go это обычный конструктор или фабричная функция:

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

## Singleton — через sync.OnceValue (Go 1.21+)

Синглтон обеспечивает единственный экземпляр объекта. В Go 1.21 появился `sync.OnceValue`, который делает это элегантно:

```go
import "sync"

type Config struct {
    DBUrl   string
    APIKey  string
}

var getConfig = sync.OnceValue(func() *Config {
    // дорогостоящая инициализация — выполняется один раз
    return &Config{
        DBUrl:  os.Getenv("DATABASE_URL"),
        APIKey: os.Getenv("API_KEY"),
    }
})

// использование в любом месте программы
cfg := getConfig()
```

Go 1.25 сохранил `sync.OnceValue`. Это потокобезопасно: инициализация запускается ровно один раз, даже при конкурентных вызовах.

До Go 1.21 синглтон реализовывали через `sync.Once`:

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

Замечание: синглтон затрудняет тестирование, так как создаёт глобальное состояние. В большинстве случаев предпочтительнее инжекция зависимостей.

## Observer — наблюдатель

Паттерн «Наблюдатель» реализует механизм подписки: объект оповещает всех подписчиков об изменениях.

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

// использование
bus := NewEventBus()

bus.Subscribe("user.created", func(e Event) {
    fmt.Println("отправляем welcome email:", e.Payload)
})

bus.Subscribe("user.created", func(e Event) {
    fmt.Println("создаём аналитическую запись:", e.Payload)
})

bus.Publish(Event{Type: "user.created", Payload: "user@example.com"})
```

В конкурентном коде часто используют каналы вместо функций-обработчиков:

```go
type EventBusChan struct {
    subscribers map[string][]chan Event
    // ...
}
```

## Decorator / Middleware — декоратор

Декоратор оборачивает объект, добавляя поведение без изменения исходного кода. В Go это особенно элегантно для HTTP-хендлеров и функций.

```go
// декоратор для http.Handler
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

// цепочка декораторов
handler := Logging(logger, Recovery(myHandler))
```

Декоратор для произвольных функций:

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

## Builder — строитель

Строитель нужен, когда объект конструируется поэтапно, а результат должен быть неизменяемым.

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
    // строим SQL строку
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

// использование
q, err := NewQuery("users").
    Where("age > 18").
    Where("active = true").
    OrderBy("created_at DESC").
    Limit(10).
    Build()
```

## Антипаттерны

**Анемичная доменная модель.** Структуры — только данные, вся логика — в сервисах. Нарушает OCP и SRP. Предпочтительнее: методы прямо на структурах.

**Интерфейс на всё.** Интерфейс для каждой структуры заранее, «на всякий случай». Усложняет код без пользы. Интерфейс нужен там, где есть несколько реализаций или потребность в тестировании.

**God Object.** Один тип или пакет со слишком широкой ответственностью. Разбивайте на меньшие специализированные части.

**init() для конфигурации.** Использование `init()` для инициализации зависимостей затрудняет тестирование. Предпочитайте явные конструкторы.

**Синглтон везде.** Глобальное состояние через синглтоны делает код трудно тестируемым. Используйте инжекцию зависимостей.

## Выбор паттерна на собеседовании

| Задача | Паттерн |
|---|---|
| Гибкая конфигурация объекта | Functional Options |
| Подключаемые алгоритмы | Strategy |
| Создание объектов по типу | Factory |
| Единственный экземпляр | sync.OnceValue |
| Реакция на события | Observer |
| Добавление поведения без изменения кода | Decorator / Middleware |
| Пошаговое создание сложного объекта | Builder |
