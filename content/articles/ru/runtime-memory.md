---
title: Управление памятью в Go
blockId: runtime-memory
parentBlockId: runtime
---

## Введение

Управление памятью — одна из тем, которая чаще всего отделяет кандидатов уровня middle от senior. Понимание того, как Go решает, куда разместить объект, когда запустить GC и почему при высокой нагрузке внезапно возрастают паузы — это не «вещи ради вещей», а инструменты, которые напрямую влияют на производительность реальных сервисов.

Данная статья охватывает три взаимосвязанных области:
- **Escape analysis** — статическое решение компилятора «стек или куча».
- **Аллокатор памяти** — трёхуровневая иерархия mcache → mcentral → mheap.
- **Garbage Collector** — трёхцветный конкурентный mark-and-sweep, write barrier, GOGC и GOMEMLIMIT.

---

## Стек vs Куча

В Go у каждой горутины есть собственный стек. Стек начинается с 8 КБ (Go 1.25) и растёт динамически по мере необходимости. Переменные, время жизни которых ограничено текущим фреймом, размещаются на стеке — это быстро, потому что:
- выделение — просто сдвиг указателя стека;
- GC стек не сканирует;
- освобождение происходит автоматически при выходе из функции.

Переменные, которые «живут» дольше своего фрейма, размещаются в **куче** — области памяти, управляемой аллокатором и GC. Куча дороже стека: надо найти свободный блок нужного размера, обновить метаданные, а потом GC должен когда-то просканировать и освободить этот объект.

Выбор между стеком и кучей делает компилятор — во время компиляции, через **escape analysis**.

---

## Escape Analysis

Escape analysis — статический анализ, определяющий, «выживет» ли объект дольше функции, которая его создала. Если нет — объект живёт на стеке. Если да — «убегает» на кучу.

```bash
go build -gcflags="-m" ./...
# или более подробно:
go build -gcflags="-m -m" ./...
```

Пример вывода:
```
./main.go:10:6: moved to heap: result
./main.go:15:14: &s escapes to heap
./main.go:22:12: inlining call to fmt.Println
```

### Когда объект убегает на кучу

**1. Указатель на локальную переменную возвращается наружу:**

```go
// result убегает на кучу — caller хранит указатель после return
func newResult() *Result {
    result := Result{Value: 42}
    return &result // escape!
}
```

**2. Переменная передаётся в интерфейс:**

```go
var w io.Writer = os.Stdout
fmt.Fprintf(w, "%d", value) // value может убежать в зависимости от типа
```

**3. Переменная захвачена замыканием в горутине:**

```go
x := 42
go func() {
    fmt.Println(x) // x убегает, горутина живёт дольше x
}()
```

**4. Динамический размер при компиляции неизвестен:**

```go
s := make([]byte, n) // если n — переменная, slice убегает на кучу
```

### Практический совет

Не нужно бояться escape — компилятор умный, и часто оптимизирует то, что кажется «очевидным» escape. Проверяйте горячие пути (hot paths) в профилировщике, а не оптимизируйте вслепую.

```go
// Плохо: []byte каждый раз убегает на кучу в hot path
func handler(w http.ResponseWriter, r *http.Request) {
    w.Write([]byte("OK")) // allocation
}

// Хорошо: переиспользовать статическую переменную
var okBody = []byte("OK")
func handler(w http.ResponseWriter, r *http.Request) {
    w.Write(okBody) // no allocation
}
```

---

## Иерархия аллокатора: mcache → mcentral → mheap

Go использует **size-class allocator** — объекты разных размеров обслуживаются отдельными пулами. Всего около 70 классов размеров (от 8 байт до 32 КБ). Объекты > 32 КБ («large objects») выделяются напрямую из mheap.

### mcache — Per-P кэш

Каждый P имеет свой mcache — набор pre-allocated span-ов для каждого класса размеров. Аллокация из mcache происходит **без блокировок**: P владеет своим mcache единолично.

```
P0.mcache: [span_8, span_16, span_24, ..., span_32768]
P1.mcache: [span_8, span_16, span_24, ..., span_32768]
```

Когда span в mcache кончается, P запрашивает новый span у mcentral.

### mcentral — Глобальный пул span-ов

mcentral хранит два списка span-ов для каждого класса размеров:
- `partial` — span-ы с есть свободными слотами;
- `full` — полностью занятые span-ы.

Доступ к mcentral защищён мьютексом уровня класса размеров (не один глобальный мьютекс!).

### mheap — Кучевая память ОС

mheap — самый нижний уровень. Он управляет страницами памяти, запрошенными у ОС через `mmap`. Структура данных — treap (дерево + куча) для быстрого поиска свободных диапазонов страниц.

Когда mcentral нуждается в новом span-е, mheap выделяет нужное количество страниц. Когда mheap кончается — запрашивает у ОС новую память через `mmap`.

```
Аллокация small object (≤32 КБ):
  mcache[sizeclass] → mcentral[sizeclass] → mheap → mmap(OS)
  
Аллокация large object (>32 КБ):
  mheap → mmap(OS)
```

---

## Garbage Collector: трёхцветный mark-and-sweep

GC Go — конкурентный, трёхцветный, mark-and-sweep. Цель: минимизировать паузы Stop-The-World, выполняя большую часть работы параллельно с программой.

### Три цвета

- **Белый** — объект не посещён. В конце маркировки все белые объекты — мусор.
- **Серый** — объект найден (достижим), но его потомки ещё не обработаны.
- **Чёрный** — объект и все его потомки обработаны; чёрный объект не будет удалён.

**Инвариант**: чёрный объект никогда не указывает напрямую на белый. Это обеспечивает write barrier.

### Фазы GC

**1. Mark Setup (STW, ~0.1–0.5 мс)**
Короткая пауза Stop-The-World:
- включается write barrier;
- сканируются root-объекты (глобальные переменные, регистры горутин).

**2. Mark (конкурентная)**
Горутины-маркировщики обходят граф объектов: серые → чёрные, их потомки → серые. Программа работает параллельно. Write barrier перехватывает мутации указателей, чтобы сохранить инвариант.

```
Начало: все объекты белые
Root scan: root-объекты → серые
Mark loop: серые → чёрные, их дети → серые
Конец: только чёрные (живые) и белые (мусор)
```

**3. Mark Termination (STW, ~0.1–0.5 мс)**
- завершение маркировки (drain remaining grey objects);
- выключение write barrier.

**4. Sweep (конкурентная)**
Белые объекты — мусор. Sweep-горутины асинхронно возвращают занятые ими span-ы в mcentral/mcache. Программа уже работает — без пауз.

### Write Barrier

Write barrier — инструкция, вставляемая компилятором перед каждой записью указателя в кучу во время конкурентной маркировки. Она обеспечивает, что если чёрный объект начинает указывать на белый (т.е. инвариант нарушается), белый объект помечается серым.

```go
// Псевдокод write barrier (Dijkstra-style, упрощённо):
func writePointer(slot *unsafe.Pointer, ptr unsafe.Pointer) {
    shade(*slot)  // пометить старое значение серым
    shade(ptr)    // пометить новое значение серым
    *slot = ptr   // запись
}
```

Write barrier активен только во время фазы Mark — в остальное время это no-op.

---

## GOGC и GOMEMLIMIT

### GOGC

`GOGC` контролирует **частоту** запуска GC через соотношение «новой памяти к живой».

```
trigger_heap = live_heap * (1 + GOGC/100)
```

При `GOGC=100` (по умолчанию): если живая куча — 100 МБ, GC запустится, когда куча вырастет до 200 МБ.

- `GOGC=200` — реже GC, больше потребление памяти, меньше CPU на GC.
- `GOGC=50` — чаще GC, меньше потребление, больше CPU на GC.
- `GOGC=off` — отключает GC полностью (осторожно!).

```go
import "runtime/debug"

// Увеличить GOGC для задач с большим количеством аллокаций
debug.SetGCPercent(200)
```

### GOMEMLIMIT (Go 1.19+)

`GOMEMLIMIT` задаёт **жёсткий верхний предел** потребления памяти. Рантайм будет запускать GC настолько агрессивно, насколько нужно, чтобы не превысить лимит.

```bash
GOMEMLIMIT=512MiB go run server.go
```

```go
import "runtime/debug"

// Динамически задать лимит
debug.SetMemoryLimit(512 * 1024 * 1024) // 512 МБ
```

**Зачем это важно в контейнерах:**
Без GOMEMLIMIT рантайм может выйти за пределы cgroup Memory Limit и получить OOM Kill от ядра. С GOMEMLIMIT Go «знает» о пределе и не допустит его превышения.

**Рекомендуемая конфигурация для контейнера:**
```bash
# 90% от лимита cgroup — оставить место для неуправляемой памяти (CGo, OS buffers)
GOMEMLIMIT=460MiB  # если cgroup limit = 512MiB
GOGC=100
```

### Взаимодействие GOGC и GOMEMLIMIT

| GOGC | GOMEMLIMIT | Поведение |
|------|-----------|-----------|
| 100 | не задан | Стандартное: GC при росте heap на 100% |
| off | 512MiB | GC запускается только при приближении к 512MiB |
| 100 | 512MiB | GC при росте heap ИЛИ при приближении к 512MiB — что наступит раньше |

---

## Диагностика: профилирование памяти

### go tool pprof

```go
import (
    "net/http"
    _ "net/http/pprof"
)

func main() {
    go http.ListenAndServe("localhost:6060", nil)
    // ... ваш код
}
```

```bash
# Heap profile
go tool pprof http://localhost:6060/debug/pprof/heap

# Аллокации (все с момента старта)
go tool pprof http://localhost:6060/debug/pprof/allocs

# Команды внутри pprof:
# top        — топ функций по аллокациям
# list func  — построчный анализ функции
# web        — граф в браузере
```

### runtime.ReadMemStats

```go
package main

import (
    "fmt"
    "runtime"
)

func printMemStats() {
    var m runtime.MemStats
    runtime.ReadMemStats(&m)
    fmt.Printf("Alloc:      %v KB\n", m.Alloc/1024)
    fmt.Printf("TotalAlloc: %v KB\n", m.TotalAlloc/1024)
    fmt.Printf("Sys:        %v KB\n", m.Sys/1024)
    fmt.Printf("NumGC:      %v\n", m.NumGC)
    fmt.Printf("PauseTotalNs: %v ms\n", m.PauseTotalNs/1e6)
}
```

### GODEBUG=gccheckmark и gcpacertrace

```bash
# Подробный лог работы GC
GODEBUG=gccheckmark=1 go run main.go

# Трассировка pacer (алгоритм управления частотой GC)
GODEBUG=gcpacertrace=1 go run main.go

# GC trace (кратко: [gc N @T s, CPU%]: heap stats)
GODEBUG=gctrace=1 go run main.go
```

Пример `gctrace=1`:
```
gc 1 @0.012s 2%: 0.11+0.89+0.006 ms clock, 0.88+0.22/0.72/0+0.054 ms cpu, 4->4->2 MB, 5 MB goal, 0 MB stacks, 0 MB globals, 8 P
```

- `4->4->2 MB` — куча до GC → после маркировки → после sweep.
- `5 MB goal` — целевой размер кучи по GOGC.
- `8 P` — количество процессоров.

---

## Практические паттерны

### sync.Pool — переиспользование объектов

`sync.Pool` позволяет переиспользовать объекты, снижая давление на GC:

```go
var bufPool = sync.Pool{
    New: func() any {
        return make([]byte, 0, 4096)
    },
}

func handler(w http.ResponseWriter, r *http.Request) {
    buf := bufPool.Get().([]byte)
    buf = buf[:0] // сбросить длину, сохранить ёмкость
    defer bufPool.Put(buf)

    // Использовать buf для обработки запроса
    buf = appendResponse(buf, r)
    w.Write(buf)
}
```

Важно: `sync.Pool` **не гарантирует** сохранение объектов между GC-циклами. Не храните там состояние — только переиспользуемые буферы.

### Избегайте лишних аллокаций в hot path

```go
// Плохо: string → []byte conversion аллоцирует каждый раз
func writeString(w io.Writer, s string) {
    w.Write([]byte(s)) // allocation
}

// Хорошо: io.WriteString избегает аллокации, если w реализует io.StringWriter
func writeString(w io.Writer, s string) {
    io.WriteString(w, s) // no allocation for strings.Builder, bufio.Writer, etc.
}
```

### Предаллокация слайсов

```go
// Плохо: многократный realloc при append
result := []Item{}
for _, id := range ids {
    result = append(result, fetchItem(id))
}

// Хорошо: одна аллокация
result := make([]Item, 0, len(ids))
for _, id := range ids {
    result = append(result, fetchItem(id))
}
```

---

## Вопросы для самопроверки

1. **Что такое escape analysis? Назовите три причины, по которым объект убегает на кучу.**
   Escape analysis — компиляторный анализ, определяющий, нужна ли переменной куча. Три причины: возврат указателя на локальную переменную, передача в интерфейс, захват замыканием горутины.

2. **Чем mcache отличается от mcentral?**
   mcache — per-P кэш без блокировок (P владеет им). mcentral — глобальный пул span-ов с мьютексом на класс размеров.

3. **Что такое write barrier и зачем он нужен?**
   Write barrier — инструкция компилятора, перехватывающая записи указателей во время конкурентной маркировки GC. Он обеспечивает инвариант: чёрный объект не может указывать на белый.

4. **Как GOMEMLIMIT защищает Go-сервис от OOM Kill в контейнере?**
   GOMEMLIMIT задаёт жёсткий предел потребления памяти. Рантайм запускает GC настолько агрессивно, насколько нужно, чтобы не превысить лимит, предотвращая OOM Kill от ядра.

5. **Как убедиться, что объект не аллоцируется на куче в hot path?**
   `go build -gcflags="-m"` покажет, что убегает. Для проверки в тестах: `testing.AllocsPerRun(N, fn)` измеряет среднее число аллокаций на вызов.

```go
func BenchmarkHandler(b *testing.B) {
    allocs := testing.AllocsPerRun(100, func() {
        handler(rw, req)
    })
    if allocs > 0 {
        b.Errorf("expected 0 allocs, got %v", allocs)
    }
}
```
