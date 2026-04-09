---
title: Context
blockId: concurrency-context
parentBlockId: concurrency
---

# Context

Пакет `context` — один из главных инструментов управления жизненным циклом горутин в Go. Он решает задачу распространения сигналов отмены, дедлайнов и произвольных данных через цепочки вызовов в конкурентной программе.

---

## Goroutine leak и зачем нужен context

Горутина, запущенная без механизма остановки, живёт до завершения программы. Это называется goroutine leak. Типичный сценарий:

```go
// НЕПРАВИЛЬНО: утечка горутины
func handler(w http.ResponseWriter, r *http.Request) {
    go func() {
        result := slowDBQuery() // что если клиент уже отключился?
        respond(w, result)
    }()
}
```

Если клиент закрыл соединение, горутина продолжает выполнять дорогой запрос к БД и пытается записать в уже закрытый `ResponseWriter`. Context позволяет связать жизненный цикл горутины с контекстом запроса:

```go
// ПРАВИЛЬНО: контекст запроса передаётся в БД
func handler(w http.ResponseWriter, r *http.Request) {
    result, err := slowDBQuery(r.Context())
    if err != nil {
        http.Error(w, err.Error(), 500)
        return
    }
    respond(w, result)
}
```

Теперь когда клиент уходит, `r.Context()` отменяется и запрос к БД прерывается.

---

## context.Background() и context.TODO()

Оба возвращают пустой контекст без отмены, дедлайна и значений. Разница — семантическая:

- `context.Background()` — корневой контекст для долгоживущих операций: `main`, тесты, инициализация сервера.
- `context.TODO()` — временная заглушка, когда неясно, какой контекст правильный. Сигнализирует: «здесь нужно решить позднее».

```go
func main() {
    ctx := context.Background()
    srv := NewServer(ctx)
    srv.Run()
}

// Заглушка при рефакторинге — заменить на реальный контекст позднее
func legacyFunc() {
    ctx := context.TODO()
    oldCodeThatNeedsContext(ctx)
}
```

Инструменты статического анализа могут помечать `context.TODO()` как предупреждение — это и есть цель.

---

## context.WithCancel и WithCancelCause (Go 1.20+)

`context.WithCancel` возвращает дочерний контекст и функцию отмены. Вызов `cancel()` сигнализирует всем потомкам этого контекста.

```go
func doWork(parent context.Context) error {
    ctx, cancel := context.WithCancel(parent)
    defer cancel() // обязательно! иначе утечка

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

`defer cancel()` — обязательный паттерн. Без него дочерний контекст не будет освобождён, пока живёт родительский.

### WithCancelCause (Go 1.20)

`context.WithCancelCause` позволяет передать причину отмены:

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
fmt.Println("причина:", context.Cause(ctx))
```

`context.Cause(ctx)` возвращает ошибку, переданную в `cancel()`. Если отмена произошла без причины или через стандартный контекст — возвращает `ctx.Err()`.

---

## context.WithTimeout и WithDeadline

`WithTimeout` и `WithDeadline` добавляют ограничение по времени. Разница лишь в том, как задаётся граница:

```go
// Таймаут: через 5 секунд
ctx, cancel := context.WithTimeout(parent, 5*time.Second)
defer cancel()

// Дедлайн: в конкретный момент времени
deadline := time.Now().Add(5 * time.Second)
ctx, cancel := context.WithDeadline(parent, deadline)
defer cancel()
```

Оба возвращают функцию `cancel`. Её нужно вызывать через `defer`, даже если таймаут уже сработал — это освобождает ресурсы.

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

Go 1.21 добавил `context.WithTimeoutCause` — аналог `WithTimeout`, но с кастомной ошибкой:

```go
ctx, cancel := context.WithTimeoutCause(
    parent,
    3*time.Second,
    fmt.Errorf("внешний API не ответил за 3 секунды"),
)
defer cancel()

// После таймаута:
// context.Cause(ctx) → "внешний API не ответил за 3 секунды"
// ctx.Err()          → context.DeadlineExceeded
```

Это полезно для диагностики — `Cause` содержит детальное описание, а `Err()` — стандартную ошибку для проверки через `errors.Is`.

---

## context.AfterFunc (Go 1.21)

`context.AfterFunc` регистрирует функцию, которая будет вызвана в отдельной горутине при отмене контекста:

```go
ctx, cancel := context.WithCancel(context.Background())

stop := context.AfterFunc(ctx, func() {
    fmt.Println("контекст отменён, выполняем очистку")
    cleanup()
})
defer stop() // отменить регистрацию, если контекст не отменялся

// ... основная работа ...
cancel()
```

`AfterFunc` возвращает функцию `stop`. Если вызвать `stop()` до отмены контекста, callback не будет выполнен. Это важно для предотвращения лишних операций.

### Интеграция с внешними библиотеками

`AfterFunc` особенно полезен для интеграции с библиотеками, которые не поддерживают контекст напрямую:

```go
func doWithLegacyLib(ctx context.Context) error {
    conn := legacyLib.NewConnection()

    stop := context.AfterFunc(ctx, func() {
        conn.Close() // закрыть соединение при отмене контекста
    })
    defer stop()

    return conn.Execute("SELECT 1")
}
```

---

## context.Cause (Go 1.20)

`context.Cause` возвращает первопричину отмены контекста:

```go
ctx, cancel := context.WithCancelCause(context.Background())
cancel(errors.New("превышен лимит повторных попыток"))

fmt.Println(ctx.Err())         // context.Canceled
fmt.Println(context.Cause(ctx)) // превышен лимит повторных попыток
```

Цепочка причин работает через вложенные контексты: `Cause` возвращает причину самого первого контекста в цепочке, для которого она была установлена.

---

## Паттерны передачи контекста

### Первый аргумент функции

Контекст передаётся как первый аргумент с именем `ctx`. Это конвенция, принятая во всём Go-сообществе:

```go
// Правильно
func GetUser(ctx context.Context, id int64) (*User, error)

// Неправильно: ctx не первый аргумент
func GetUser(id int64, ctx context.Context) (*User, error)
```

### Не хранить контекст в структуре

Хранение контекста в структуре — антипаттерн. Контекст привязан к конкретному запросу или операции, а структура живёт дольше.

```go
// НЕПРАВИЛЬНО
type Service struct {
    ctx context.Context // нельзя!
    db  *sql.DB
}

func (s *Service) GetUser(id int64) (*User, error) {
    return queryUser(s.ctx, s.db, id)
}

// ПРАВИЛЬНО: контекст — через аргумент
type Service struct {
    db *sql.DB
}

func (s *Service) GetUser(ctx context.Context, id int64) (*User, error) {
    return queryUser(ctx, s.db, id)
}
```

Исключение: структуры запросов (например, `http.Request` содержит контекст), но это осознанное архитектурное решение.

### Значения в контексте

`context.WithValue` позволяет хранить произвольные данные в контексте. Используйте его умеренно — только для данных, имеющих смысл для всего запроса: trace ID, authenticated user, request ID.

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

Используйте нестроковые типы ключей (или кастомный тип поверх строки), чтобы избежать коллизий между пакетами.

---

## Propagation: HTTP → DB → gRPC

В реальном сервере контекст пронизывает все слои обработки запроса:

```go
func (h *Handler) CreateOrder(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context() // контекст HTTP запроса

    // Middleware уже обогатил контекст: trace ID, пользователь
    user, _ := UserFromContext(ctx)

    // Передаём контекст в сервисный слой
    order, err := h.orderService.Create(ctx, user.ID, r.Body)
    if err != nil {
        http.Error(w, err.Error(), 500)
        return
    }

    // Отвечаем клиенту
    json.NewEncoder(w).Encode(order)
}

func (s *OrderService) Create(ctx context.Context, userID int64, body io.Reader) (*Order, error) {
    // Передаём контекст в репозиторий (PostgreSQL/MongoDB)
    if err := s.repo.Save(ctx, order); err != nil {
        return nil, err
    }

    // Передаём контекст в gRPC-вызов
    _, err := s.inventoryClient.Reserve(ctx, &pb.ReserveRequest{...})
    return order, err
}
```

Если клиент закрыл соединение на любом из уровней — `ctx.Done()` закроется везде по цепочке.

---

## Типичные ошибки

### Утечка из-за забытого cancel

```go
// НЕПРАВИЛЬНО: cancel не вызывается
func process(parent context.Context) {
    ctx, _ := context.WithTimeout(parent, time.Second)
    doWork(ctx)
    // cancel утекает вместе с ресурсами таймера
}

// ПРАВИЛЬНО
func process(parent context.Context) {
    ctx, cancel := context.WithTimeout(parent, time.Second)
    defer cancel()
    doWork(ctx)
}
```

### Игнорирование отмены

```go
// НЕПРАВИЛЬНО: не проверяем ctx.Done()
func processItems(ctx context.Context, items []Item) {
    for _, item := range items {
        process(item) // продолжаем даже если контекст отменён
    }
}

// ПРАВИЛЬНО
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

### Передача nil контекста

```go
// НЕПРАВИЛЬНО: nil контекст вызовет панику
func getUser(ctx context.Context, id int) (*User, error) {
    req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
    // ...
}
getUser(nil, 42) // паника: nil context

// ПРАВИЛЬНО: используйте context.Background()
getUser(context.Background(), 42)
```

### Хранение контекста в горутине без передачи

```go
// НЕПРАВИЛЬНО: контекст захвачен в замыкании, но не отслеживается
go func() {
    time.Sleep(10 * time.Second) // работает даже после отмены ctx
    doWork()
}()

// ПРАВИЛЬНО: горутина проверяет контекст
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

## Итоги

Контекст — это договор между вызывающим кодом и вызываемым: «если меня отменят, я скажу тебе». Основные правила:

1. Всегда передавайте контекст первым аргументом.
2. Не храните контекст в структурах.
3. Всегда вызывайте `cancel()` через `defer`.
4. Проверяйте `ctx.Done()` в долгих операциях и циклах.
5. Используйте `context.Cause` для детальной диагностики ошибок.
6. `context.AfterFunc` — для интеграции с кодом без поддержки контекста.
