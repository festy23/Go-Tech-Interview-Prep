---
title: Пакет sync
blockId: concurrency-sync
parentBlockId: concurrency
---

# Пакет sync

Конкурентный код в Go строится вокруг горутин, каналов и пакета `sync`. Каналы хорошо работают для передачи данных между горутинами, но для защиты разделяемого состояния примитивы пакета `sync` часто проще и эффективнее. В этой статье разберём весь основной инструментарий: мьютексы, группы ожидания, однократную инициализацию, атомики, пулы объектов и детектор гонок.

---

## sync.Mutex и sync.RWMutex

`sync.Mutex` — базовый механизм взаимного исключения. Горутина вызывает `Lock()`, выполняет критическую секцию и вызывает `Unlock()`.

```go
type Counter struct {
    mu    sync.Mutex
    value int
}

func (c *Counter) Inc() {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.value++
}

func (c *Counter) Get() int {
    c.mu.Lock()
    defer c.mu.Unlock()
    return c.value
}
```

`defer c.mu.Unlock()` — стандартный идиом. Он гарантирует освобождение блокировки при любом выходе из функции, включая панику. Не используйте `defer` только там, где это критично для производительности в очень горячих циклах.

### Когда нужен RWMutex

`sync.RWMutex` разделяет операции на читателей и писателей. Множество горутин могут держать читательскую блокировку одновременно, но писательская блокировка — исключительная.

```go
type Config struct {
    mu   sync.RWMutex
    data map[string]string
}

func (c *Config) Get(key string) string {
    c.mu.RLock()
    defer c.mu.RUnlock()
    return c.data[key]
}

func (c *Config) Set(key, value string) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.data[key] = value
}
```

**Правило выбора**: используйте `RWMutex`, если операций чтения значительно больше, чем записи, и критическая секция достаточно длинная, чтобы параллельное чтение давало прирост. При коротких критических секциях накладные расходы `RWMutex` могут перекрыть выгоду.

### Типичные ошибки с мьютексами

Мьютекс нельзя копировать после первого использования. Передавайте структуры с мьютексом по указателю:

```go
// Неправильно: копирование мьютекса
func process(c Counter) { ... }

// Правильно: передача по указателю
func process(c *Counter) { ... }
```

---

## sync.WaitGroup и wg.Go() (Go 1.25)

`sync.WaitGroup` позволяет дождаться завершения группы горутин. В Go 1.25 появился метод `wg.Go()`, который принимает функцию, запускает её в горутине, и автоматически управляет счётчиком — больше не нужен ручной `Add/Done`.

```go
func fetchAll(urls []string) []string {
    var (
        wg      sync.WaitGroup
        mu      sync.Mutex
        results []string
    )

    for _, url := range urls {
        wg.Go(func() {
            data := fetch(url) // url захватывается по ссылке в Go 1.22+
            mu.Lock()
            results = append(results, data)
            mu.Unlock()
        })
    }

    wg.Wait()
    return results
}
```

`wg.Go()` объединяет `wg.Add(1)` и запуск горутины в одном вызове. Внутри горутины `Done()` вызывается автоматически после возврата из переданной функции. Это исключает класс ошибок, когда программист забывает вызвать `Done()` или вызывает `Add()` после старта горутины.

### Паттерн fan-out с wg.Go

```go
func processItems(items []Item) {
    var wg sync.WaitGroup
    for i := range len(items) {  // Go 1.22+: range по целому числу
        wg.Go(func() {
            process(items[i])
        })
    }
    wg.Wait()
}
```

Обратите внимание на `for i := range len(items)` — современный синтаксис Go 1.22+, не требующий `for i := 0; i < len(items); i++`.

---

## sync.Once, sync.OnceFunc, sync.OnceValue (Go 1.21+)

`sync.Once` гарантирует однократное выполнение функции вне зависимости от того, сколько горутин обращается к ней параллельно. Классический пример — ленивая инициализация синглтона.

```go
var (
    instance *DB
    once     sync.Once
)

func GetDB() *DB {
    once.Do(func() {
        instance = connectDB()
    })
    return instance
}
```

### sync.OnceValue — инициализация с возвратом значения (Go 1.21)

`sync.Once` неудобен, когда нужно вернуть результат инициализации. Go 1.21 добавил `sync.OnceValue`:

```go
var getDB = sync.OnceValue(func() *DB {
    return connectDB()
})

// Использование: db := getDB()
```

`sync.OnceValue` принимает функцию без аргументов, возвращающую значение типа `T`, и возвращает `func() T`, которая при первом вызове выполняет функцию, кэширует результат и возвращает его при всех последующих вызовах.

### sync.OnceFunc — однократный вызов произвольной функции (Go 1.21)

```go
var initLogger = sync.OnceFunc(func() {
    log.SetFlags(log.Ltime | log.Lshortfile)
    log.SetOutput(os.Stderr)
})

// initLogger() можно вызывать из любого места — выполнится только один раз
```

`sync.OnceFunc` аналогичен `sync.Once.Do`, но возвращает функцию, что позволяет использовать его без хранения переменной `sync.Once`.

---

## sync/atomic — атомарные операции

Пакет `sync/atomic` предоставляет низкоуровневые атомарные примитивы. В Go 1.19 появились типизированные атомарные типы.

### atomic.Bool

```go
type Server struct {
    running atomic.Bool
}

func (s *Server) Start() {
    if s.running.Swap(true) {
        return // уже запущен
    }
    go s.serve()
}

func (s *Server) Stop() {
    s.running.Store(false)
}
```

### atomic.Int64

```go
var requestCount atomic.Int64

func handleRequest(w http.ResponseWriter, r *http.Request) {
    requestCount.Add(1)
    // ...
}

func getStats() int64 {
    return requestCount.Load()
}
```

### atomic.Pointer[T] (Go 1.19)

Атомарный указатель позволяет реализовать lock-free замену конфигурации в реальном времени:

```go
type AppConfig struct {
    Timeout time.Duration
    MaxConn int
}

var config atomic.Pointer[AppConfig]

func init() {
    config.Store(&AppConfig{Timeout: 5 * time.Second, MaxConn: 100})
}

func updateConfig(newCfg *AppConfig) {
    config.Store(newCfg)
}

func getTimeout() time.Duration {
    return config.Load().Timeout
}
```

**Когда использовать атомики вместо мьютексов**: атомики подходят для простых счётчиков, флагов и указателей на неизменяемые структуры. Для более сложных инвариантов, охватывающих несколько переменных, используйте мьютекс.

---

## sync.Pool — переиспользование объектов

`sync.Pool` позволяет кэшировать временные объекты, уменьшая давление на сборщик мусора. Типичный сценарий — буферы или сложные структуры, которые часто создаются и уничтожаются.

```go
var bufPool = sync.Pool{
    New: func() any {
        return new(bytes.Buffer)
    },
}

func encode(data any) ([]byte, error) {
    buf := bufPool.Get().(*bytes.Buffer)
    buf.Reset()
    defer bufPool.Put(buf)

    if err := json.NewEncoder(buf).Encode(data); err != nil {
        return nil, err
    }
    return buf.Bytes(), nil
}
```

### Важные нюансы Pool

- Объекты из пула могут быть удалены GC в любой момент — не рассчитывайте на сохранение состояния.
- Всегда вызывайте `Reset()` перед использованием объекта из пула, так как предыдущий пользователь мог оставить данные.
- `sync.Pool` не для объектов с долгим временем жизни — для этого используйте обычный кэш.
- Пул разделяется между P (логическими процессорами), поэтому конкуренция минимальна.

---

## Data race и детектор -race

Гонка данных (data race) происходит, когда две горутины обращаются к одной переменной без синхронизации, и хотя бы одна из них пишет. Гонки — один из самых коварных видов ошибок: они могут не проявляться при обычном тестировании.

### Пример гонки

```go
// НЕПРАВИЛЬНО: гонка данных
func badCounter() {
    var count int
    var wg sync.WaitGroup
    for range 1000 {
        wg.Go(func() {
            count++ // гонка! несколько горутин читают и пишут count
        })
    }
    wg.Wait()
    fmt.Println(count) // непредсказуемый результат
}
```

### Запуск детектора гонок

```bash
go test -race ./...
go run -race main.go
go build -race -o myapp .
```

Детектор `-race` добавляет инструментацию при компиляции, которая отслеживает все обращения к памяти и сообщает о гонках во время выполнения. Накладные расходы — примерно 5-10x по времени и 2-5x по памяти, поэтому в продакшене использовать нельзя.

### Исправление гонки

```go
// Вариант 1: атомик
func atomicCounter() int {
    var count atomic.Int64
    var wg sync.WaitGroup
    for range 1000 {
        wg.Go(func() {
            count.Add(1)
        })
    }
    wg.Wait()
    return int(count.Load())
}

// Вариант 2: мьютекс
func mutexCounter() int {
    var (
        count int
        mu    sync.Mutex
        wg    sync.WaitGroup
    )
    for range 1000 {
        wg.Go(func() {
            mu.Lock()
            count++
            mu.Unlock()
        })
    }
    wg.Wait()
    return count
}
```

---

## errgroup — горутины с обработкой ошибок

Стандартный `sync.WaitGroup` не передаёт ошибки из горутин. Пакет `golang.org/x/sync/errgroup` решает эту проблему.

```go
import "golang.org/x/sync/errgroup"

func fetchAll(ctx context.Context, urls []string) ([][]byte, error) {
    g, ctx := errgroup.WithContext(ctx)
    results := make([][]byte, len(urls))

    for i, url := range urls {
        g.Go(func() error {
            resp, err := ctxhttp.Get(ctx, nil, url)
            if err != nil {
                return fmt.Errorf("fetch %s: %w", url, err)
            }
            defer resp.Body.Close()
            results[i], err = io.ReadAll(resp.Body)
            return err
        })
    }

    if err := g.Wait(); err != nil {
        return nil, err
    }
    return results, nil
}
```

`errgroup.WithContext` создаёт дочерний контекст, который отменяется при первой ошибке. Это позволяет остальным горутинам завершиться досрочно, если они проверяют `ctx.Done()`.

### Ограничение параллелизма

```go
g.SetLimit(10) // не более 10 горутин одновременно

for _, url := range urls {
    g.Go(func() error {
        return processURL(ctx, url)
    })
}
```

`SetLimit` добавляет семафор, предотвращающий перегрузку системы при большом количестве задач.

---

## Итоги

| Примитив | Когда использовать |
|---|---|
| `sync.Mutex` | Защита любого разделяемого состояния |
| `sync.RWMutex` | Много читателей, редкие записи |
| `sync.WaitGroup` / `wg.Go()` | Ожидание завершения горутин |
| `sync.Once` / `OnceValue` | Однократная инициализация |
| `atomic.*` | Простые счётчики и флаги без мьютекса |
| `sync.Pool` | Переиспользование дорогих объектов |
| `errgroup` | Горутины с возвратом ошибок |

Детектор `-race` должен быть частью CI — запускайте `go test -race ./...` при каждом PR.
