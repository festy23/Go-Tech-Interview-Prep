---
title: Отображения (Maps) в Go
blockId: primitives-maps
parentBlockId: primitives
---

# Отображения (Maps) в Go

Map — это хэш-таблица. В Go она является встроенным типом и предоставляет O(1) амортизированные операции вставки, удаления и поиска. Несмотря на простоту использования, map имеет ряд важных особенностей, которые регулярно встречаются на интервью.

## Внутреннее устройство

Go runtime реализует map как массив **бакетов** (buckets). Каждый бакет хранит до 8 пар ключ-значение. При хэшировании ключа младшие биты хэша определяют номер бакета, старшие биты (tophash) используются для быстрого сравнения внутри бакета.

Начиная с Go 1.24, runtime map использует **Swiss Tables** — более эффективную реализацию, позаимствованную из Abseil (C++). Swiss Tables используют SIMD-инструкции там, где это доступно, что даёт прирост производительности при больших map.

```
map[string]int{"a": 1, "b": 2, "c": 3}

Хэш-таблица:
┌─────────┬─────────┬─────────┐
│ bucket0 │ bucket1 │ bucket2 │ ...
└────┬────┴─────────┴─────────┘
     │
     ▼
┌──────────────────┐
│ tophash[8]       │  верхние биты хэша для быстрого сравнения
│ keys[8]          │  ключи
│ values[8]        │  значения
│ overflow *bucket │  цепочка при переполнении
└──────────────────┘
```

При достижении **load factor** около 6.5 (среднее число элементов на бакет) map перестраивается: создаётся новый массив бакетов вдвое большего размера, элементы переносятся постепенно (инкрементально, чтобы не блокировать операции).

## Порядок итерации рандомизирован намеренно

Порядок перебора элементов map в Go намеренно рандомизирован при каждом запуске:

```go
m := map[string]int{"a": 1, "b": 2, "c": 3}

// Каждый раз может быть разный порядок
for k, v := range m {
    fmt.Printf("%s: %d\n", k, v)
}
```

Это сделано специально, начиная с Go 1.0, чтобы разработчики не полагались на конкретный порядок итерации. В реальности порядок может случайно стать стабильным при определённых условиях — но это деталь реализации, на которую нельзя полагаться.

Для упорядоченной итерации нужно явно сортировать ключи:

```go
m := map[string]int{"banana": 2, "apple": 1, "cherry": 3}

keys := slices.Collect(maps.Keys(m)) // Go 1.23: maps.Keys возвращает iter.Seq[K]
slices.Sort(keys)

for _, k := range keys {
    fmt.Printf("%s: %d\n", k, m[k])
}
```

## Создание и инициализация

```go
// Литерал
m := map[string]int{"a": 1, "b": 2}

// make с начальной ёмкостью
m = make(map[string]int)
m = make(map[string]int, 100) // подсказка о начальном размере

// nil-map
var m2 map[string]int // m2 == nil
```

### nil map vs пустая map

```go
var m map[string]int // nil map

// Чтение из nil map — безопасно, возвращает нулевое значение
v := m["key"] // v = 0, нет паники

// Запись в nil map — паника!
m["key"] = 1 // panic: assignment to entry in nil map

// Правильно: всегда инициализировать перед записью
m = make(map[string]int)
m["key"] = 1
```

## Базовые операции

```go
m := map[string]int{}

// Вставка / обновление
m["alice"] = 30
m["bob"] = 25

// Чтение
age := m["alice"]           // 30
age = m["charlie"]          // 0 — нулевое значение, не ошибка

// Проверка существования
age, ok := m["charlie"]
if !ok {
    fmt.Println("charlie not found") // charlie not found
}

// Удаление
delete(m, "alice")
delete(m, "nonexistent") // ок, нет паники

// Количество элементов
fmt.Println(len(m)) // 1

// Очистка (Go 1.21)
clear(m) // удаляет все элементы, m != nil
fmt.Println(len(m)) // 0
```

## Конкурентный доступ

Map в Go **не потокобезопасна**. Конкурентный доступ без синхронизации вызывает гонку данных и panics в runtime:

```go
m := map[string]int{}

// ОПАСНО: гонка данных
go func() { m["a"] = 1 }()
go func() { m["b"] = 2 }()

// Runtime обнаруживает конкурентный доступ и вызывает панику:
// fatal error: concurrent map read and map write
```

### Синхронизация через sync.RWMutex

```go
type SafeMap struct {
    mu sync.RWMutex
    m  map[string]int
}

func (s *SafeMap) Get(key string) (int, bool) {
    s.mu.RLock()
    defer s.mu.RUnlock()
    v, ok := s.m[key]
    return v, ok
}

func (s *SafeMap) Set(key string, val int) {
    s.mu.Lock()
    defer s.mu.Unlock()
    s.m[key] = val
}
```

### sync.Map

`sync.Map` оптимизирован для двух сценариев:
1. Запись один раз, чтение много раз (read-heavy, stable keys)
2. Конкурентные записи в непересекающиеся ключи

```go
var sm sync.Map

// Store
sm.Store("key", 42)

// Load
v, ok := sm.Load("key")
if ok {
    fmt.Println(v.(int)) // 42
}

// LoadOrStore — атомарная операция
actual, loaded := sm.LoadOrStore("key2", 100)
// loaded=false, actual=100

// Delete
sm.Delete("key")

// Range
sm.Range(func(key, value any) bool {
    fmt.Printf("%v: %v\n", key, value)
    return true // вернуть false для остановки
})
```

`sync.Map` не подходит как замена обычной map во всех случаях: для высокочастотных операций записи в один ключ `mutex + map` будет эффективнее.

## Пакет maps (Go 1.21+)

Пакет `maps` предоставляет типобезопасные утилиты для работы с отображениями.

### maps.Clone

```go
original := map[string]int{"a": 1, "b": 2, "c": 3}
clone := maps.Clone(original)

clone["d"] = 4
fmt.Println(original) // map[a:1 b:2 c:3] — не изменился
```

Внимание: это **поверхностное** копирование. Если значения — указатели или срезы, они будут разделены.

### maps.Copy

```go
dst := map[string]int{"x": 10}
src := map[string]int{"a": 1, "b": 2, "x": 99}

maps.Copy(dst, src)
fmt.Println(dst) // map[a:1 b:2 x:99] — x перезаписан
```

### maps.DeleteFunc

```go
m := map[string]int{"a": 1, "b": -2, "c": 3, "d": -4}

// Удалить все отрицательные значения
maps.DeleteFunc(m, func(key string, val int) bool {
    return val < 0
})
fmt.Println(m) // map[a:1 c:3]
```

### maps.Keys и maps.Values (Go 1.23)

В Go 1.23 `maps.Keys` и `maps.Values` возвращают итераторы `iter.Seq`:

```go
m := map[string]int{"a": 1, "b": 2, "c": 3}

// Итерация по ключам
for k := range maps.Keys(m) {
    fmt.Println(k)
}

// Преобразование в срез через slices.Collect
keys := slices.Collect(maps.Keys(m))
slices.Sort(keys)

values := slices.Collect(maps.Values(m))
```

### maps.Equal и maps.EqualFunc

```go
m1 := map[string]int{"a": 1, "b": 2}
m2 := map[string]int{"a": 1, "b": 2}
m3 := map[string]int{"a": 1, "b": 3}

maps.Equal(m1, m2) // true
maps.Equal(m1, m3) // false

// С кастомным компаратором
maps.EqualFunc(m1, m3, func(v1, v2 int) bool {
    return abs(v1-v2) <= 1 // "почти равны"
})
```

## clear (Go 1.21)

Встроенная функция `clear` удаляет все элементы из map (в отличие от присваивания nil новой map):

```go
m := map[string]int{"a": 1, "b": 2}
clear(m)
fmt.Println(len(m)) // 0
fmt.Println(m == nil) // false — map существует, просто пуста

// В отличие от:
m = make(map[string]int) // пересоздание — аллокация
```

Используйте `clear` когда хотите переиспользовать map (избежать аллокации), а не создавать новую.

## Типичные паттерны

### Счётчик / частотный анализ

```go
func charFrequency(s string) map[rune]int {
    freq := make(map[rune]int)
    for _, r := range s {
        freq[r]++
    }
    return freq
}
```

### Группировка

```go
func groupByAge(people []Person) map[int][]Person {
    groups := make(map[int][]Person)
    for _, p := range people {
        groups[p.Age] = append(groups[p.Age], p)
    }
    return groups
}
```

### Кэш / мемоизация

```go
type Memo struct {
    mu    sync.Mutex
    cache map[int]int
}

func (m *Memo) Fibonacci(n int) int {
    m.mu.Lock()
    if v, ok := m.cache[n]; ok {
        m.mu.Unlock()
        return v
    }
    m.mu.Unlock()

    var result int
    if n <= 1 {
        result = n
    } else {
        result = m.Fibonacci(n-1) + m.Fibonacci(n-2)
    }

    m.mu.Lock()
    m.cache[n] = result
    m.mu.Unlock()
    return result
}
```

### Set через map

Go не имеет встроенного типа Set. Обычно используется `map[T]struct{}`:

```go
type Set[T comparable] map[T]struct{}

func (s Set[T]) Add(v T)            { s[v] = struct{}{} }
func (s Set[T]) Contains(v T) bool  { _, ok := s[v]; return ok }
func (s Set[T]) Remove(v T)         { delete(s, v) }
func (s Set[T]) Len() int           { return len(s) }
```

### GetOrDefault паттерн

```go
// Значение по умолчанию для отсутствующего ключа
func getOrDefault[K comparable, V any](m map[K]V, key K, defaultVal V) V {
    if v, ok := m[key]; ok {
        return v
    }
    return defaultVal
}

// Или через cmp.Or (Go 1.22+) — но только для сравнимых нулей
result := cmp.Or(m["key"], "default")
```

## Ключи map

Ключом может быть любой **comparable** тип: числа, строки, булевы, указатели, массивы (если элементы comparable), структуры (если все поля comparable).

Нельзя использовать: срезы, функции, другие map.

```go
// Структура как ключ
type Point struct{ X, Y int }
distances := map[Point]float64{
    {0, 0}: 0,
    {3, 4}: 5,
}

// Массив как ключ (фиксированный размер)
pairs := map[[2]string]int{
    {"a", "b"}: 1,
    {"c", "d"}: 2,
}
```

## Типичные ловушки

### Ловушка 1: Запись в nil map

```go
var m map[string]int
m["key"] = 1 // panic: assignment to entry in nil map
```

### Ловушка 2: Модификация структуры-значения в map

```go
type Counter struct{ Count int }
m := map[string]Counter{"a": {Count: 0}}

m["a"].Count++ // ошибка компиляции!
// cannot assign to struct field in map

// Правильно:
c := m["a"]
c.Count++
m["a"] = c

// Или используйте указатели:
m2 := map[string]*Counter{"a": {Count: 0}}
m2["a"].Count++ // ok
```

### Ловушка 3: Итерация по map во время удаления

```go
m := map[string]int{"a": 1, "b": 2, "c": 3}

// БЕЗОПАСНО в Go: удаление элементов во время range
for k, v := range m {
    if v > 1 {
        delete(m, k) // в Go это допустимо
    }
}
```

В Go это допустимо — `range` создаёт снапшот итерируемых ключей перед началом.

### Ловушка 4: Проверка существования через нулевое значение

```go
m := map[string]int{"present": 0}

// ПЛОХО: нельзя отличить "ключ отсутствует" от "значение = 0"
if m["missing"] == 0 {
    // и "missing" и "present" попадут сюда!
}

// ХОРОШО: двухзначное присваивание
if v, ok := m["present"]; ok {
    fmt.Println("found:", v) // found: 0
}
```

## Итог

Map в Go — хэш-таблица с O(1) амортизированными операциями. Порядок итерации рандомизирован. Конкурентный доступ без синхронизации вызывает панику — используйте `sync.RWMutex` или `sync.Map`. Встроенная функция `clear` (Go 1.21) очищает map без пересоздания. Пакет `maps` предоставляет `maps.Clone`, `maps.Copy`, `maps.DeleteFunc`, а начиная с Go 1.23 — `maps.Keys` и `maps.Values` как итераторы. Всегда инициализируйте map перед записью — запись в nil map вызывает панику.
