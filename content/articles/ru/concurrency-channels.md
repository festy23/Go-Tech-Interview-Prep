---
title: Каналы
blockId: concurrency-channels
parentBlockId: concurrency
---

# Каналы в Go

## Введение

Каналы — основной механизм коммуникации между горутинами в Go. Философия языка выражена в знаменитой цитате Роба Пайка:

> *"Don't communicate by sharing memory; share memory by communicating."*
> *— Не общайтесь через разделяемую память — разделяйте память через общение.*

Вместо того чтобы использовать мьютексы и общие переменные, горутины передают данные напрямую через каналы. Это устраняет целый класс ошибок: гонки данных, забытые блокировки, дедлоки из-за порядка захвата мьютексов.

Канал — это типизированный конвейер: `chan T` может передавать только значения типа `T`. Создаются каналы функцией `make`.

---

## Небуферизованные каналы

```go
ch := make(chan int) // небуферизованный канал int
```

Небуферизованный канал — это **синхронная** точка встречи (рандеву):

- Отправитель (`ch <- val`) **блокируется**, пока получатель не будет готов читать.
- Получатель (`val := <-ch`) **блокируется**, пока отправитель не отправит значение.

Обе стороны должны быть готовы одновременно — как передача предмета из рук в руки.

```go
package main

import (
    "fmt"
    "time"
)

func main() {
    ch := make(chan string)

    go func() {
        time.Sleep(500 * time.Millisecond) // имитация работы
        ch <- "результат"                  // блокируется, пока main не прочитает
        fmt.Println("горутина: значение отправлено")
    }()

    fmt.Println("main: жду...")
    msg := <-ch // блокируется, пока горутина не отправит
    fmt.Println("main: получил:", msg)
}
```

**Гарантия happens-before.** Всё, что горутина-отправитель сделала *до* `ch <- val`, гарантированно видно получателю *после* `val := <-ch`. Канал — это точка синхронизации памяти.

**Сигнальный канал.** Идиоматичный способ сообщить о завершении — канал `chan struct{}` (нулевой размер, без выделения памяти):

```go
done := make(chan struct{})
go func() {
    doWork()
    close(done) // сигнал: работа завершена
}()
<-done // ждём сигнала
```

---

## Буферизованные каналы

```go
ch := make(chan int, 5) // буфер на 5 элементов
```

Буферизованный канал работает как очередь FIFO фиксированного размера:

- Отправка **не блокируется**, пока в буфере есть место.
- Отправка **блокируется**, когда буфер полон.
- Получение **не блокируется**, пока в буфере есть данные.
- Получение **блокируется**, когда буфер пуст.

```go
package main

import "fmt"

func main() {
    ch := make(chan string, 3)

    // Три отправки не блокируются — буфер вмещает 3
    ch <- "первый"
    ch <- "второй"
    ch <- "третий"

    fmt.Printf("len=%d, cap=%d\n", len(ch), cap(ch)) // len=3, cap=3

    // Читаем в порядке FIFO
    fmt.Println(<-ch) // "первый"
    fmt.Println(<-ch) // "второй"
    fmt.Println(<-ch) // "третий"
}
```

**Когда использовать буферизованный канал:**

- Производитель и потребитель работают с разной скоростью (сглаживание пиков нагрузки).
- Реализация семафора (см. ниже).
- Нужно отправить ровно N значений из одной горутины без блокировки (буфер ≥ N).

**Когда не использовать:** не стоит делать буфер «на всякий случай» — это маскирует логические ошибки. Начинайте с небуферизованных каналов.

---

## select: мультиплексирование каналов

`select` — аналог `switch`, но для операций с каналами. Он ждёт, пока хотя бы один `case` станет готов, и выполняет его.

```go
select {
case msg := <-ch1:
    fmt.Println("из ch1:", msg)
case msg := <-ch2:
    fmt.Println("из ch2:", msg)
}
```

Ключевые свойства:

1. Если готово несколько `case` — выбирается **случайный** (не первый). Это предотвращает голодание каналов.
2. Если ни один не готов — `select` блокируется.
3. `default` — выполняется немедленно, если ни один `case` не готов (неблокирующий `select`).

### Паттерн: таймаут

```go
import "time"

select {
case result := <-workCh:
    fmt.Println("результат:", result)
case <-time.After(2 * time.Second):
    fmt.Println("таймаут: слишком долго")
}
```

### Паттерн: неблокирующее получение

```go
select {
case val := <-ch:
    fmt.Println("получено:", val)
default:
    fmt.Println("канал пуст, не блокируемся")
}
```

### Паттерн: отмена через context

```go
select {
case data := <-dataCh:
    process(data)
case <-ctx.Done():
    return ctx.Err()
}
```

### Паттерн: отключение case через nil-канал

Присвоение `nil` каналу в `select` навсегда "замораживает" соответствующий `case` — он никогда не будет выбран:

```go
func merge(a, b <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for a != nil || b != nil {
            select {
            case v, ok := <-a:
                if !ok { a = nil; continue } // отключаем закрытый канал
                out <- v
            case v, ok := <-b:
                if !ok { b = nil; continue }
                out <- v
            }
        }
    }()
    return out
}
```

---

## Pipeline: конвейер обработки

Pipeline — цепочка стадий, соединённых каналами. Каждая стадия:
1. Читает из входного канала.
2. Обрабатывает данные.
3. Пишет в выходной канал.

Каждая стадия работает в своей горутине — это даёт параллелизм по стадиям (как конвейер на заводе).

```go
package main

import (
    "context"
    "fmt"
)

// generate — источник данных: отправляет числа в канал.
func generate(ctx context.Context, nums ...int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for _, n := range nums {
            select {
            case <-ctx.Done():
                return
            case out <- n:
            }
        }
    }()
    return out
}

// square — трансформация: возводит каждое число в квадрат.
func square(ctx context.Context, in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for n := range in {
            select {
            case <-ctx.Done():
                return
            case out <- n * n:
            }
        }
    }()
    return out
}

// filter — фильтрация: пропускает только чётные числа.
func filter(ctx context.Context, in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for n := range in {
            if n%2 != 0 {
                continue
            }
            select {
            case <-ctx.Done():
                return
            case out <- n:
            }
        }
    }()
    return out
}

func main() {
    ctx := context.Background()

    // Собираем конвейер: generate → square → filter
    nums := generate(ctx, 1, 2, 3, 4, 5, 6)
    squares := square(ctx, nums)
    evens := filter(ctx, squares)

    // Читаем финальный результат
    for v := range evens {
        fmt.Println(v) // 4, 16, 36
    }
}
```

**Правила корректного завершения конвейера:**
- Каждая стадия закрывает свой выходной канал командой `defer close(out)`.
- Закрытие канала распространяется по цепочке: закрытие входа → стадия завершает `range` → закрывает свой выход.
- Для досрочной остановки используйте `context.Context`.

---

## Fan-out / Fan-in

**Fan-out** — несколько горутин читают из одного канала задач. Go гарантирует: каждое значение получит ровно одна горутина.

**Fan-in** — несколько каналов сливаются в один выходной канал.

Вместе они образуют паттерн: распараллелить обработку → собрать результаты.

```go
package main

import (
    "context"
    "fmt"
    "sync"
    "time"

    "golang.org/x/sync/errgroup"
)

// worker — один воркер Fan-out: читает задачи из jobs, пишет результаты в results.
func worker(ctx context.Context, id int, jobs <-chan int, results chan<- int) {
    for job := range jobs {
        select {
        case <-ctx.Done():
            return
        default:
        }
        // Имитация обработки
        time.Sleep(10 * time.Millisecond)
        results <- job * job
        fmt.Printf("воркер %d: %d² = %d\n", id, job, job*job)
    }
}

// fanOut запускает n воркеров, читающих из одного канала задач.
func fanOut(ctx context.Context, jobs <-chan int, n int) <-chan int {
    results := make(chan int, n)
    var wg sync.WaitGroup

    for i := range n { // Go 1.22+: for i := range n
        wg.Go(func() { // Go 1.25+: wg.Go заменяет wg.Add(1) + go func() + defer wg.Done()
            worker(ctx, i+1, jobs, results)
        })
    }

    // Закрываем results, когда все воркеры завершились
    go func() {
        wg.Wait()
        close(results)
    }()

    return results
}

func main() {
    ctx := context.Background()

    // Наполняем канал задач
    jobs := make(chan int, 10)
    for i := range 10 {
        jobs <- i + 1
    }
    close(jobs)

    // Fan-out: 3 воркера параллельно обрабатывают задачи
    results := fanOut(ctx, jobs, 3)

    // Fan-in: собираем все результаты
    total := 0
    for r := range results {
        total += r
    }
    fmt.Println("Сумма квадратов:", total)
}
```

### Fan-out с errgroup (Go 1.25)

В Go 1.25 `errgroup.Group` поддерживает метод `wg.Go()`, который запускает горутину и агрегирует первую ошибку:

```go
package main

import (
    "context"
    "fmt"
    "net/http"

    "golang.org/x/sync/errgroup"
)

func main() {
    ctx := context.Background()
    urls := []string{
        "https://go.dev",
        "https://pkg.go.dev",
        "https://blog.golang.org",
    }

    g, ctx := errgroup.WithContext(ctx)
    results := make(chan int, len(urls))

    for _, url := range urls { // Go 1.22+: url := url больше не нужен
        g.Go(func() error { // wg.Go() — запуск горутины с обработкой ошибок
            resp, err := http.Get(url)
            if err != nil {
                return err
            }
            defer resp.Body.Close()
            results <- resp.StatusCode
            return nil
        })
    }

    // Ждём всех и закрываем канал результатов
    go func() {
        g.Wait()
        close(results)
    }()

    for code := range results {
        fmt.Println("статус:", code)
    }

    if err := g.Wait(); err != nil {
        fmt.Println("ошибка:", err)
    }
}
```

---

## Семафор через буферизованный канал

Семафор ограничивает количество **одновременно** выполняемых операций. В Go он реализуется через буферизованный канал ёмкостью N:

- **Захват (acquire):** `sem <- struct{}{}` — занимаем слот. Если буфер полон (N операций уже активны), горутина блокируется.
- **Освобождение (release):** `<-sem` — освобождаем слот.

```go
package main

import (
    "context"
    "fmt"
    "sync"
    "time"
)

type semaphore chan struct{}

func newSemaphore(n int) semaphore {
    return make(semaphore, n)
}

func (s semaphore) acquire() { s <- struct{}{} }
func (s semaphore) release() { <-s }

func fetchURL(ctx context.Context, sem semaphore, id int) {
    sem.acquire()         // занять слот
    defer sem.release()   // освободить слот при выходе

    fmt.Printf("  [%d] запрос начат (активных ≤ 3)\n", id)
    select {
    case <-ctx.Done():
        return
    case <-time.After(100 * time.Millisecond):
    }
    fmt.Printf("  [%d] запрос завершён\n", id)
}

func main() {
    ctx := context.Background()
    sem := newSemaphore(3) // не более 3 одновременных операций
    var wg sync.WaitGroup

    for i := range 10 {
        wg.Go(func() { // Go 1.25+: wg.Go заменяет wg.Add(1) + go func() + defer wg.Done()
            fetchURL(ctx, sem, i+1)
        })
    }

    wg.Wait()
    fmt.Println("Все запросы выполнены.")
}
```

**Сравнение с пулом воркеров:**

| | Семафор | Пул воркеров |
|---|---|---|
| Создание горутин | Динамически (по задаче) | Фиксированный набор |
| Подходит когда | Каждая задача уникальна (замыкания) | Однотипные задачи через канал |
| Накладные расходы | Выше (N горутин создаётся) | Ниже (горутины переиспользуются) |

Для продакшена также можно использовать `golang.org/x/sync/semaphore` — взвешенный семафор из стандартной библиотеки расширений.

---

## Закрытие каналов

```go
close(ch) // сигнал: больше значений не будет
```

**Правила закрытия:**

1. Закрывать канал должен **только отправитель**, никогда получатель.
2. Закрытие уже закрытого канала → `panic: close of closed channel`.
3. Закрытие `nil`-канала → `panic: close of nil channel`.
4. Отправка в закрытый канал → `panic: send on closed channel`.

**Чтение из закрытого канала** не паникует — это безопасная операция:

```go
ch := make(chan int, 3)
ch <- 10
ch <- 20
close(ch)

// Буферизованные значения читаются нормально:
v1, ok := <-ch // v1=10, ok=true
v2, ok := <-ch // v2=20, ok=true
v3, ok := <-ch // v3=0,  ok=false (канал закрыт и пуст)
```

**Идиоматичный итератор** — `for range` по каналу:

```go
// Автоматически завершается при закрытии канала
for val := range ch {
    process(val)
}
// Внимание: без close(ch) range будет ждать вечно → deadlock
```

**Broadcast через закрытие.** `close(ch)` мгновенно разблокирует **всех** ожидающих получателей:

```go
quit := make(chan struct{})

for i := range 5 {
    go func() {
        <-quit // все 5 горутин ждут
        fmt.Printf("горутина %d: получила сигнал остановки\n", i)
    }()
}

close(quit) // все 5 горутин разблокируются одновременно
```

---

## Типичные ошибки

### 1. Deadlock

Возникает, когда все горутины заблокированы в ожидании друг друга:

```go
// ПЛОХО: некому читать из канала
ch := make(chan int)
ch <- 42 // блокируется навсегда → fatal error: all goroutines are asleep
```

**Как исправить:** убедитесь, что для каждой отправки есть получатель (в другой горутине или через буфер).

### 2. Send on closed channel

```go
ch := make(chan int, 1)
close(ch)
ch <- 1 // panic: send on closed channel
```

**Паттерн защиты** при нескольких отправителях — используйте `sync.Once` для закрытия:

```go
var once sync.Once
safeClose := func() { once.Do(func() { close(ch) }) }
```

### 3. Nil-канал: вечная блокировка

```go
var ch chan int // ch == nil
ch <- 1        // блокируется навсегда
<-ch           // блокируется навсегда
```

`nil`-канал в `select` игнорируется (его `case` никогда не выбирается) — это полезное свойство для динамического отключения `case`-ов.

### 4. Утечка горутины через незакрытый канал

```go
func producer() <-chan int {
    ch := make(chan int)
    go func() {
        for i := range 100 {
            ch <- i // если получатель ушёл — горутина висит вечно
        }
        // close(ch) забыли!
    }()
    return ch
}
```

**Решение:** всегда закрывайте каналы (`defer close(ch)`) или используйте `context.Context` для сигнала отмены.

### 5. Гонка при закрытии: несколько отправителей

При нескольких горутинах-отправителях нельзя просто вызвать `close(ch)` — другие могут ещё отправлять. Идиоматичное решение: использовать `sync.WaitGroup` и закрывать канал после завершения **всех** отправителей:

```go
var wg sync.WaitGroup
ch := make(chan int)

for i := range 5 {
    wg.Go(func() { // Go 1.25+: wg.Go заменяет wg.Add(1) + go func() + defer wg.Done()
        ch <- i
    })
}

go func() {
    wg.Wait()
    close(ch) // безопасно: все отправители завершили работу
}()

for v := range ch {
    fmt.Println(v)
}
```

---

## Вопросы для самопроверки

1. Чем отличается небуферизованный канал от буферизованного? Какую гарантию даёт небуферизованный?
2. Что произойдёт, если вызвать `select` без `default` и ни один `case` не готов?
3. Почему в `select` при нескольких готовых `case` выбирается случайный, а не первый?
4. Как реализовать таймаут операции с каналом?
5. В чём разница между паттернами Fan-out и Worker Pool?
6. Объясните реализацию семафора через буферизованный канал. Что происходит при `acquire`, когда буфер полон?
7. Кто должен закрывать канал — отправитель или получатель? Почему?
8. Что вернёт `v, ok := <-ch`, если канал закрыт и буфер пуст?
9. Как nil-канал ведёт себя в `select`? Для чего это используется?
10. Что такое "утечка горутины" при работе с каналами и как её избежать?
