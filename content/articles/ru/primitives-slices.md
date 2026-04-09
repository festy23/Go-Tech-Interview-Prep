---
title: Срезы в Go
blockId: primitives-slices
parentBlockId: primitives
---

# Срезы в Go

Срез (slice) — главная структура данных Go. Он есть везде: в аргументах функций, в возвращаемых значениях, в структурах. Понимание того, как срез устроен изнутри, необходимо для написания корректного кода и прохождения любого технического интервью по Go.

## Внутреннее устройство среза

Срез — это не массив. Срез — это **заголовок** из трёх полей:

```go
type SliceHeader struct {
    Data unsafe.Pointer // указатель на первый элемент в базовом массиве
    Len  int            // количество элементов доступных через срез
    Cap  int            // количество элементов от Data до конца базового массива
}
```

Базовый массив — это реальные данные в памяти. Несколько срезов могут указывать на один и тот же массив.

```go
a := [5]int{1, 2, 3, 4, 5}
s1 := a[1:4] // len=3, cap=4, указывает на a[1]
s2 := a[2:4] // len=2, cap=3, указывает на a[2]

s1[0] = 99
fmt.Println(a) // [1 99 3 4 5] — a изменился!
fmt.Println(s2[0]) // 3 — s2[0] указывает на a[2], не тронутый
```

### Массив vs Срез

| | Массив | Срез |
|--|--------|------|
| Тип | `[N]T` | `[]T` |
| Размер | Часть типа, фиксированный | Динамический |
| Передача в функцию | Копия всех данных | Копия заголовка (24 байта) |
| nil | Невозможен | Возможен |
| Comparable | Да (если T comparable) | Нет |

```go
// Массив — значение, всегда копируется
var arr [3]int = [3]int{1, 2, 3}
arr2 := arr   // полная копия
arr2[0] = 99
fmt.Println(arr) // [1 2 3] — не изменился

// Срез — заголовок, базовый массив не копируется
s := []int{1, 2, 3}
s2 := s
s2[0] = 99
fmt.Println(s) // [99 2 3] — изменился!
```

## Создание срезов

```go
// Литерал
s := []int{1, 2, 3}          // len=3, cap=3

// make
s = make([]int, 5)            // len=5, cap=5, заполнен нулями
s = make([]int, 3, 10)        // len=3, cap=10

// Срез массива
a := [5]int{1, 2, 3, 4, 5}
s = a[1:3]                    // len=2, cap=4

// nil-срез
var s2 []int                   // len=0, cap=0, s2 == nil

// Пустой срез
s3 := []int{}                  // len=0, cap=0, s3 != nil
s4 := make([]int, 0)           // len=0, cap=0, s4 != nil
```

### nil срез vs пустой срез

```go
var nilSlice []int
emptySlice := []int{}

fmt.Println(nilSlice == nil)   // true
fmt.Println(emptySlice == nil) // false

// Оба работают с range, len, append
fmt.Println(len(nilSlice))    // 0
for range nilSlice {}          // ок, не паникует

// Но отличаются в JSON
json.Marshal(nilSlice)   // null
json.Marshal(emptySlice) // []
```

Для большинства целей они взаимозаменяемы. Но если API должен вернуть `[]`, а не `null` в JSON, используйте пустой срез.

## Механика append

`append` — это функция, которая может вернуть **другой** срез:

```go
s := make([]int, 3, 5) // len=3, cap=5
s = append(s, 4)        // len=4, cap=5 — тот же базовый массив
s = append(s, 5)        // len=5, cap=5 — тот же базовый массив
s = append(s, 6)        // len=6, cap=10 — новый массив! cap удвоилась (приблизительно)
```

Критически важно всегда присваивать результат `append` обратно в переменную:

```go
// Ошибка: append игнорируется
func addElement(s []int, elem int) {
    append(s, elem) // результат выброшен!
}

// Правильно:
func addElement(s []int, elem int) []int {
    return append(s, elem)
}
```

### Стратегия роста

До Go 1.18 ёмкость удваивалась. Начиная с Go 1.18 используется плавный алгоритм:

- Для маленьких срезов: примерно удвоение
- Для больших (1024+): рост примерно на 25%

Точные значения зависят от размера элементов и выравнивания памяти.

### append нескольких элементов

```go
s := []int{1, 2, 3}

// Несколько элементов
s = append(s, 4, 5, 6)

// Распаковка другого среза
other := []int{7, 8, 9}
s = append(s, other...) // len=9
```

## Срез от среза: утечка памяти

Сабсрез не копирует данные — он указывает в тот же базовый массив:

```go
big := make([]byte, 1<<20) // 1 MB
small := big[0:10]          // 10 байт, но удерживает 1 MB в памяти!
```

Пока `small` жив, весь `big` не может быть собран сборщиком мусора.

Решение — явное копирование:

```go
small := make([]byte, 10)
copy(small, big[0:10])
// Теперь big может быть собран GC
```

Или через `slices.Clone`:

```go
small := slices.Clone(big[0:10])
```

### Трёхиндексный срез

```go
// s[low:high:max] — ограничивает cap
s := []int{1, 2, 3, 4, 5}
t := s[1:3:3] // len=2, cap=2 (не 4!)
```

Это предотвращает следующий `append` от записи в исходный массив.

## Пакет slices (Go 1.21)

`slices` — типобезопасный пакет для работы со срезами, использующий дженерики.

### Сортировка

```go
s := []int{3, 1, 4, 1, 5, 9, 2, 6}
slices.Sort(s) // сортирует на месте
// [1 1 2 3 4 5 6 9]

// Сортировка с компаратором
type Person struct{ Name string; Age int }
people := []Person{{"Alice", 30}, {"Bob", 25}}
slices.SortFunc(people, func(a, b Person) int {
    return cmp.Compare(a.Age, b.Age)
})

// Обратная сортировка
slices.SortFunc(s, func(a, b int) int {
    return cmp.Compare(b, a) // b и a поменяны местами
})
```

### Поиск

```go
s := []int{1, 2, 3, 4, 5}

slices.Contains(s, 3)         // true
slices.Index(s, 3)            // 2 (индекс первого вхождения, -1 если нет)
slices.ContainsFunc(s, func(x int) bool { return x > 3 }) // true

// Бинарный поиск (требует отсортированный срез)
i, found := slices.BinarySearch(s, 3) // i=2, found=true
```

### Удаление дублей и компактизация

```go
s := []int{1, 1, 2, 3, 3, 3, 4}

// slices.Compact удаляет последовательные дубликаты (как uniq в Unix)
s = slices.Compact(s) // [1 2 3 4]

// Для несортированного входа сначала нужна сортировка:
unsorted := []int{3, 1, 2, 1, 3}
slices.Sort(unsorted)
unsorted = slices.Compact(unsorted) // [1 2 3]
```

### Clone и Clip

```go
original := []int{1, 2, 3, 4, 5}

// Clone — полная копия (len и cap равны len оригинала)
clone := slices.Clone(original)

// Clip — удаляет "лишнюю" ёмкость (устанавливает cap = len)
s := original[:3] // len=3, cap=5
s = slices.Clip(s) // len=3, cap=3 — позволяет GC собрать хвост
```

### Reverse и другие

```go
s := []int{1, 2, 3, 4, 5}
slices.Reverse(s) // [5 4 3 2 1] — на месте

// Удаление элемента по индексу (Go 1.21)
s = slices.Delete(s, 1, 2) // удаляет s[1:2]

// Вставка элементов
s = slices.Insert(s, 1, 99, 100) // вставляет 99, 100 перед s[1]

// Max/Min в срезе
m := slices.Max(s)
m = slices.Min(s)
```

## copy

`copy` копирует элементы между срезами, возвращает количество скопированных:

```go
src := []int{1, 2, 3, 4, 5}
dst := make([]int, 3)
n := copy(dst, src) // n=3, dst=[1,2,3]

// copy безопасен для перекрывающихся срезов
s := []int{1, 2, 3, 4, 5}
copy(s[1:], s[:4]) // s = [1, 1, 2, 3, 4]
```

## Паттерны со срезами

### Фильтрация без аллокации

```go
func filter[T any](s []T, keep func(T) bool) []T {
    result := s[:0] // переиспользуем тот же базовый массив
    for _, v := range s {
        if keep(v) {
            result = append(result, v)
        }
    }
    return result
}
```

Внимание: это безопасно, только если исходный срез больше не нужен.

### Удаление элемента по значению

```go
func remove[T comparable](s []T, val T) []T {
    i := slices.Index(s, val)
    if i < 0 {
        return s
    }
    return slices.Delete(s, i, i+1)
}
```

### Дедупликация

```go
func dedup[T comparable](s []T) []T {
    seen := make(map[T]struct{})
    result := s[:0]
    for _, v := range s {
        if _, ok := seen[v]; !ok {
            seen[v] = struct{}{}
            result = append(result, v)
        }
    }
    return result
}
```

### Стек (LIFO)

```go
var stack []int

// Push
stack = append(stack, 1)
stack = append(stack, 2)
stack = append(stack, 3)

// Pop
n := len(stack)
top := stack[n-1]
stack = stack[:n-1]
```

### Очередь (FIFO) — неэффективная через срез

```go
var q []int

// Enqueue
q = append(q, 1)

// Dequeue — O(n)!
front := q[0]
q = q[1:]
```

Для эффективной очереди используйте `container/ring` или самописный ring buffer.

## Типичные ловушки

### Ловушка 1: append изменяет общий базовый массив

```go
a := []int{1, 2, 3, 4, 5}
b := a[:3]   // [1 2 3], cap=5

b = append(b, 99) // len(b)=4, len(a)=5, но a[3] теперь 99!
fmt.Println(a)    // [1 2 3 99 5]
```

Используйте трёхиндексный срез или `slices.Clone`:

```go
b := slices.Clone(a[:3]) // независимая копия
b = append(b, 99)        // не затрагивает a
```

### Ловушка 2: range по срезу копирует элементы

```go
type Point struct{ X, Y int }
points := []Point{{1, 2}, {3, 4}}

for _, p := range points {
    p.X = 99 // изменяет копию, не оригинал!
}
fmt.Println(points) // [{1 2} {3 4}]

// Правильно:
for i := range points {
    points[i].X = 99
}
```

### Ловушка 3: Паника при доступе за пределами len

```go
s := make([]int, 3, 10)
s[5] = 1 // паника: index out of range!

// cap не влияет на безопасность доступа по индексу
// только append использует cap
```

### Ловушка 4: Goroutine захватывает переменную range

```go
// В Go 1.22+ переменная цикла создаётся заново на каждой итерации:
for i, v := range s {
    go func() {
        fmt.Println(i, v) // Go 1.22+: корректно
    }()
}
```

До Go 1.22 нужно было передавать как аргумент:

```go
for i, v := range s {
    go func(i, v int) {
        fmt.Println(i, v)
    }(i, v)
}
```

## Производительность

### Предварительное выделение ёмкости

```go
// Плохо: множество реаллокаций
result := []int{}
for i := range 10000 {
    result = append(result, i*i)
}

// Хорошо: одна аллокация
result := make([]int, 0, 10000)
for i := range 10000 {
    result = append(result, i*i)
}
```

### Передача среза в функцию

```go
// Срезы передаются по значению (заголовок), но базовый массив не копируется
func sum(s []int) int {
    total := 0
    for _, v := range s {
        total += v
    }
    return total
}
// Передача []int{...} с миллионом элементов — копируются только 24 байта заголовка
```

## Итог

Срез в Go — трёхполевой заголовок (data, len, cap) поверх массива. `append` может вернуть новый срез с другим базовым массивом — всегда сохраняйте результат. Сабсрезы разделяют память с исходным срезом, что может привести к утечке памяти — используйте `slices.Clone` или `copy`. Пакет `slices` (Go 1.21) предоставляет типобезопасные утилиты: `slices.Sort`, `slices.Contains`, `slices.Compact`, `slices.Clip`, `slices.Clone`.
