---
title: SOLID в Go
blockId: oop-solid
parentBlockId: oop
---

# SOLID в Go

SOLID — пять принципов объектно-ориентированного дизайна, сформулированных Робертом Мартином. В языках с классами эти принципы часто показывают через иерархии наследования. В Go — через пакеты, интерфейсы и конструкторы. Понимание того, как SOLID реализуется без классов, — популярная тема на собеседованиях в командах, пишущих на Go.

## S — Single Responsibility Principle (Принцип единственной ответственности)

**Определение:** модуль должен иметь одну и только одну причину для изменения.

В Go единица ответственности — это **пакет**. Хороший пакет делает одну вещь и делает её хорошо. Типичная ошибка — монолитный пакет `util` или `helpers`, который со временем обрастает несвязанным кодом.

Пример нарушения:

```go
// пакет order — делает слишком много
package order

func CreateOrder(userID int64, items []Item) (*Order, error) { ... }
func SendConfirmationEmail(order *Order) error { ... }   // работа с email
func SaveOrderToDB(order *Order) error { ... }           // работа с БД
func GenerateInvoicePDF(order *Order) []byte { ... }    // генерация PDF
```

Пример соблюдения:

```go
// пакет order — только бизнес-логика заказа
package order

func New(userID int64, items []Item) (*Order, error) { ... }
func (o *Order) TotalPrice() float64 { ... }

// пакет notify — только уведомления
package notify

func SendOrderConfirmation(email string, order *order.Order) error { ... }

// пакет storage — только персистентность
package storage

func SaveOrder(ctx context.Context, order *order.Order) error { ... }
```

Каждый пакет теперь меняется по своей причине: `order` — при изменении бизнес-правил, `notify` — при смене email-провайдера, `storage` — при миграции базы данных.

На уровне типов SRP выражается в небольших структурах с чётко определённой ответственностью:

```go
// плохо: структура знает слишком много
type UserService struct {
    db        *sql.DB
    cache     *redis.Client
    emailSMTP string
    logger    *slog.Logger
}

// лучше: разделить на специализированные типы
type UserRepo struct{ db *sql.DB }
type UserCache struct{ client *redis.Client }
type UserNotifier struct{ smtp string }
```

## O — Open/Closed Principle (Принцип открытости/закрытости)

**Определение:** программный объект должен быть открыт для расширения, но закрыт для модификации.

В Go это реализуется через интерфейсы. Функция, принимающая интерфейс, принимает любой будущий тип без изменений своего кода.

```go
type Exporter interface {
    Export(data []byte) error
}

type ReportService struct {
    exporter Exporter
}

func (s *ReportService) GenerateReport(data []byte) error {
    // логика генерации отчёта
    return s.exporter.Export(data)
}
```

Добавить поддержку нового формата экспорта — не значит изменить `ReportService`. Достаточно создать новый тип:

```go
type CSVExporter struct{ path string }
func (e *CSVExporter) Export(data []byte) error { ... }

type S3Exporter struct{ bucket string }
func (e *S3Exporter) Export(data []byte) error { ... }

type SlackExporter struct{ webhook string }
func (e *SlackExporter) Export(data []byte) error { ... }
```

`ReportService` закрыт для модификации, но открыт для расширения через новые реализации `Exporter`.

Ещё один идиоматичный инструмент — **функциональные опции** (Functional Options pattern). Новые параметры конфигурации добавляются без изменения сигнатуры конструктора:

```go
type Server struct {
    addr      string
    timeout   time.Duration
    logger    *slog.Logger
    maxConns  *int          // указатель: nil = не ограничено
}

type Option func(*Server)

func WithTimeout(d time.Duration) Option {
    return func(s *Server) { s.timeout = d }
}

func WithLogger(l *slog.Logger) Option {
    return func(s *Server) { s.logger = l }
}

func WithMaxConns(n int) Option {
    // Go 1.26: new(n) возвращает *int без промежуточной переменной
    return func(s *Server) { s.maxConns = new(n) }
}

func NewServer(addr string, opts ...Option) *Server {
    s := &Server{addr: addr, timeout: 30 * time.Second}
    for _, opt := range opts {
        opt(s)
    }
    return s
}

// использование
srv := NewServer(":8080", WithTimeout(60*time.Second), WithLogger(myLogger), WithMaxConns(500))
```

## L — Liskov Substitution Principle (Принцип подстановки Лисков)

**Определение:** если `S` — подтип `T`, то объекты типа `T` в программе могут быть заменены объектами типа `S` без изменения желательных свойств программы.

В Go это означает: реализация интерфейса должна соответствовать **семантическому контракту** интерфейса, не только сигнатуре.

```go
type Cache interface {
    Get(key string) ([]byte, bool)
    Set(key string, value []byte, ttl time.Duration)
}

// Корректная реализация — соблюдает контракт
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

// Нарушение LSP — паникует при определённых условиях
type BrokenCache struct{}

func (c *BrokenCache) Get(key string) ([]byte, bool) {
    panic("not implemented") // нарушает контракт: Get не должен паниковать
}
```

Практическое правило: реализация интерфейса не должна сужать поведение (паниковать там, где оригинал возвращает ошибку, игнорировать параметры, возвращать nil там, где ожидается значение).

В Go 1.26 можно проверить соответствие типа интерфейсу статически на этапе компиляции:

```go
var _ Cache = (*MemoryCache)(nil)  // компилятор выдаст ошибку, если тип не реализует Cache
```

## I — Interface Segregation Principle (Принцип разделения интерфейсов)

**Определение:** клиент не должен зависеть от методов, которые он не использует.

Это, пожалуй, принцип, который Go реализует наиболее элегантно. Маленькие интерфейсы из одного-двух методов — идиома Go.

Пример нарушения — «жирный» интерфейс:

```go
// плохо: все методы в одном интерфейсе
type FileSystem interface {
    Read(path string) ([]byte, error)
    Write(path string, data []byte) error
    Delete(path string) error
    ListDir(path string) ([]string, error)
    MakeDir(path string) error
    Stat(path string) (os.FileInfo, error)
}
```

Функция, которой нужно только читать файлы, вынуждена зависеть от всего `FileSystem`. Разделите интерфейс:

```go
// хорошо: маленькие интерфейсы по ролям
type FileReader interface {
    Read(path string) ([]byte, error)
}

type FileWriter interface {
    Write(path string, data []byte) error
}

type DirLister interface {
    ListDir(path string) ([]string, error)
}

// комбинируем только там, где действительно нужно
type ReadWriter interface {
    FileReader
    FileWriter
}
```

Теперь функция, которой нужен только `FileReader`, не тащит за собой зависимость на операции записи и удаления:

```go
func CountLines(r FileReader, path string) (int, error) {
    data, err := r.Read(path)
    if err != nil {
        return 0, err
    }
    return bytes.Count(data, []byte("\n")), nil
}
```

Это упрощает тестирование: мок для `FileReader` тривиален.

```go
type mockReader struct{ content []byte }
func (m *mockReader) Read(_ string) ([]byte, error) { return m.content, nil }
```

## D — Dependency Inversion Principle (Принцип инверсии зависимостей)

**Определение:** модули верхнего уровня не должны зависеть от модулей нижнего уровня; оба должны зависеть от абстракций.

В Go абстракция — это интерфейс. DIP реализуется через **инжекцию зависимостей в конструктор**.

Нарушение — прямая зависимость от конкретного типа:

```go
// плохо: OrderService напрямую зависит от PostgresRepo
type OrderService struct {
    repo *PostgresOrderRepo  // конкретный тип
}

func NewOrderService() *OrderService {
    return &OrderService{repo: NewPostgresOrderRepo()}
}
```

Соблюдение — зависимость от абстракции:

```go
// хорошо: зависимость от интерфейса
type OrderRepository interface {
    Save(ctx context.Context, order *Order) error
    FindByID(ctx context.Context, id int64) (*Order, error)
}

type OrderService struct {
    repo OrderRepository  // абстракция
}

func NewOrderService(repo OrderRepository) *OrderService {
    return &OrderService{repo: repo}
}
```

Теперь `OrderService` не знает, что стоит за `OrderRepository` — Postgres, SQLite, in-memory реализация для тестов, или мок. Конструктор получает зависимость извне.

Полный пример с тестом:

```go
// production
pgRepo := postgres.NewOrderRepo(db)
svc := order.NewOrderService(pgRepo)

// тест
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

Детально dependency injection — конструкторный, Wire, fx — рассмотрен в статье «DI в Go».

## SOLID и идиоматичный Go

| Принцип | Инструмент Go |
|---|---|
| SRP | Маленькие пакеты с одной ответственностью |
| OCP | Интерфейсы + Functional Options |
| LSP | Семантические контракты интерфейсов |
| ISP | Маленькие интерфейсы (1–2 метода) |
| DIP | Конструкторная инжекция через интерфейс |

Все пять принципов выражаются на Go лаконично — нередко лаконичнее, чем в Java или C#. Это объясняется тем, что неявная реализация интерфейсов снимает накладные расходы на декларации и позволяет определять интерфейсы на стороне потребителя, а не производителя.
