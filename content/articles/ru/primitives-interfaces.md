---
title: Интерфейсы в Go
blockId: primitives-interfaces
parentBlockId: primitives
---

# Интерфейсы в Go

Интерфейсы — один из самых мощных и одновременно тонких механизмов Go. Они обеспечивают полиморфизм без иерархии наследования, следуют принципу «утиной типизации» и лежат в основе таких пакетов как `io`, `fmt`, `sort`. На интервью интерфейсы — обязательная тема.

## Неявная реализация

В Go интерфейс реализуется **неявно**: не нужно объявлять `implements`. Достаточно реализовать все методы интерфейса:

```go
type Animal interface {
    Sound() string
    Name() string
}

type Dog struct{}

func (d Dog) Sound() string { return "Woof" }
func (d Dog) Name() string  { return "Dog" }

// Dog автоматически реализует Animal
var a Animal = Dog{}
fmt.Println(a.Sound()) // Woof
```

Это фундаментальное отличие от Java/C#, где нужно явно указывать `implements`. В Go интерфейс — это контракт, который тип может удовлетворять, даже не зная о существовании этого интерфейса.

## Внутреннее устройство интерфейса

Интерфейс в памяти — это структура из двух указателей:

```go
// Упрощённо:
type iface struct {
    tab  *itab         // указатель на таблицу методов
    data unsafe.Pointer // указатель на данные
}

type itab struct {
    inter *interfacetype // описание интерфейса
    _type *_type         // тип конкретного значения
    hash  uint32         // хэш типа
    fun   [...]uintptr   // таблица методов
}
```

При вызове метода через интерфейс происходит косвенный вызов через таблицу методов (`fun`). Это дороже прямого вызова, но быстрее reflection.

`tab == nil` означает nil-интерфейс (не содержит ни типа, ни значения).

## nil-интерфейс vs интерфейс с nil-значением

Это самая распространённая ловушка при работе с интерфейсами:

```go
type MyError struct{ msg string }
func (e *MyError) Error() string { return e.msg }

func getError(fail bool) error {
    var err *MyError // nil-указатель типа *MyError
    if fail {
        err = &MyError{"something failed"}
    }
    return err // ВНИМАНИЕ: возвращаем не nil-интерфейс!
}

e := getError(false)
fmt.Println(e == nil) // false! Не nil!
```

Почему? Потому что `e` — это интерфейс `error` со значением `(*MyError)(nil)`. Интерфейс содержит тип (`*MyError`) и значение (`nil`). Это не nil-интерфейс.

```
nil-интерфейс:             интерфейс с nil-значением:
┌──────┬──────┐           ┌────────────┬──────┐
│ tab  │ nil  │           │ *itab(err) │ nil  │
│ data │ nil  │           │            │      │
└──────┴──────┘           └────────────┴──────┘
   == nil: true               == nil: false
```

**Правило**: никогда не возвращайте конкретный nil-указатель через интерфейс. Если нужно вернуть nil через интерфейс, используйте явный nil:

```go
func getError(fail bool) error {
    if fail {
        return &MyError{"something failed"}
    }
    return nil // явный nil-интерфейс
}
```

## Пустой интерфейс: any

`interface{}` (псевдоним `any` с Go 1.18) принимает значение любого типа:

```go
var x any = 42
x = "hello"
x = []int{1, 2, 3}

// any используется там, где тип не известен заранее
func printAll(values []any) {
    for _, v := range values {
        fmt.Println(v)
    }
}
```

`any` не даёт доступа к методам конкретного типа — нужно type assertion или type switch.

## Type Assertion

Type assertion извлекает конкретное значение из интерфейса:

```go
var i any = "hello"

// Небезопасный вариант — паника если тип не совпадает
s := i.(string)
fmt.Println(s) // hello

// Безопасный вариант — ok-идиома
s, ok := i.(string)
if !ok {
    fmt.Println("not a string")
}

// Ошибка:
n := i.(int) // panic: interface conversion: interface {} is string, not int
```

Type assertion не кастует тип, а извлекает конкретное значение. Работает только с интерфейсами.

## Type Switch

Type switch позволяет ветвиться по типу значения:

```go
func describe(i any) string {
    switch v := i.(type) {
    case int:
        return fmt.Sprintf("int: %d", v)
    case string:
        return fmt.Sprintf("string: %q", v)
    case []int:
        return fmt.Sprintf("[]int with %d elements", len(v))
    case nil:
        return "nil"
    default:
        return fmt.Sprintf("unknown: %T", v)
    }
}
```

Это идиоматический способ обработки различных типов в Go. `v` в каждом case имеет конкретный тип.

## Стандартные интерфейсы

### io.Reader и io.Writer

Два самых важных интерфейса в стандартной библиотеке:

```go
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}
```

Вся система ввода-вывода в Go строится вокруг этих интерфейсов: файлы, сетевые соединения, буферы, gzip, crypto — всё реализует `io.Reader` или `io.Writer`.

```go
// Любой Reader можно передать в io.Copy
func copyData(dst io.Writer, src io.Reader) (int64, error) {
    return io.Copy(dst, src)
}

// Работает с файлами, HTTP-телами, bytes.Buffer, strings.Reader...
io.Copy(os.Stdout, strings.NewReader("hello"))
io.Copy(file, resp.Body)
io.Copy(&buf, os.Stdin)
```

### error

Интерфейс `error` — один из самых простых:

```go
type error interface {
    Error() string
}
```

Любой тип с методом `Error() string` реализует `error`. Это позволяет создавать богатые типы ошибок:

```go
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation error on %s: %s", e.Field, e.Message)
}

// Использование
var err error = &ValidationError{Field: "email", Message: "invalid format"}

// Раскрытие через errors.AsType (Go 1.26)
if ve, ok := errors.AsType[*ValidationError](err); ok {
    fmt.Println(ve.Field) // email
}
```

### fmt.Stringer

Интерфейс для строкового представления:

```go
type Stringer interface {
    String() string
}
```

```go
type Color int

const (
    Red Color = iota
    Green
    Blue
)

func (c Color) String() string {
    switch c {
    case Red:   return "Red"
    case Green: return "Green"
    case Blue:  return "Blue"
    default:    return fmt.Sprintf("Color(%d)", int(c))
    }
}

fmt.Println(Red)   // Red — fmt автоматически вызывает String()
fmt.Printf("%v\n", Green) // Green
```

### sort.Interface

```go
type Interface interface {
    Len() int
    Less(i, j int) bool
    Swap(i, j int)
}
```

```go
type ByLength []string

func (s ByLength) Len() int           { return len(s) }
func (s ByLength) Less(i, j int) bool { return len(s[i]) < len(s[j]) }
func (s ByLength) Swap(i, j int)      { s[i], s[j] = s[j], s[i] }

words := []string{"banana", "apple", "kiwi"}
sort.Sort(ByLength(words))
fmt.Println(words) // [kiwi apple banana]
```

Хотя для большинства случаев теперь проще использовать `slices.SortFunc` с дженериками.

## Интерфейс как контракт

Go следует принципу **разделения интерфейсов** (Interface Segregation Principle): маленькие, узкоспециализированные интерфейсы лучше больших. Сравните:

```go
// Плохо: монолитный интерфейс
type Storage interface {
    Read(id string) ([]byte, error)
    Write(id string, data []byte) error
    Delete(id string) error
    List() ([]string, error)
    Stats() StorageStats
}

// Хорошо: разбит на части
type Reader interface {
    Read(id string) ([]byte, error)
}

type Writer interface {
    Write(id string, data []byte) error
    Delete(id string) error
}

type Lister interface {
    List() ([]string, error)
}
```

Функции принимают минимально необходимый интерфейс:

```go
func processItem(r Reader, id string) error { ... }
func backupData(l Lister, r Reader, w Writer) error { ... }
```

## Интерфейсы и дженерики

С появлением дженериков в Go 1.18 интерфейсы получили новую роль — ограничения типов (type constraints):

```go
type Ordered interface {
    ~int | ~int8 | ~int16 | ~int32 | ~int64 |
    ~uint | ~uint8 | ~uint16 | ~uint32 | ~uint64 | ~uintptr |
    ~float32 | ~float64 |
    ~string
}

func Min[T Ordered](a, b T) T {
    if a < b {
        return a
    }
    return b
}
```

Встроенный пакет `cmp` определяет интерфейс `cmp.Ordered`, используемый во всём стандартном пакете `slices` и `maps`.

## Встраивание интерфейсов

Интерфейсы можно встраивать друг в друга:

```go
type ReadWriter interface {
    io.Reader
    io.Writer
}

type ReadWriteCloser interface {
    io.Reader
    io.Writer
    io.Closer
}
```

Стандартная библиотека активно использует этот подход: `io.ReadWriter`, `io.ReadWriteCloser`, `io.ReadWriteSeeker` и т.д.

## Проверка реализации интерфейса на этапе компиляции

Идиоматический способ проверить, что тип реализует интерфейс:

```go
// Эта строка вызовет ошибку компиляции, если Dog не реализует Animal
var _ Animal = (*Dog)(nil)
var _ Animal = Dog{} // если методы не на указателе
```

Это особенно полезно в больших кодовых базах, где интерфейс и его реализации могут находиться в разных пакетах.

## Типичные ловушки

### Ловушка 1: Метод на указателе vs значении

```go
type Writer struct{ buf []byte }

// Метод на указателе
func (w *Writer) Write(p []byte) (n int, err error) {
    w.buf = append(w.buf, p...)
    return len(p), nil
}

var w Writer
var iw io.Writer = &w     // ok: *Writer реализует io.Writer
// var iw io.Writer = w   // ошибка! Writer не реализует io.Writer (нужен *Writer)
```

Правило: если метод определён на указателе `*T`, то только `*T` реализует интерфейс. `T` — нет.

### Ловушка 2: Горутина через интерфейс — невидимые аллокации

```go
// Вызов метода через интерфейс требует escape-анализа
// Конкретное значение может быть аллоцировано в heap
func process(r io.Reader) { ... }

buf := bytes.NewReader(data)
process(buf) // buf передаётся через интерфейс — возможна аллокация
```

В горячих путях рассмотрите передачу конкретного типа.

### Ловушка 3: Сравнение интерфейсов может паниковать

```go
var a, b any

a = []int{1, 2, 3}
b = []int{1, 2, 3}

// panic: runtime error: comparing uncomparable type []int
fmt.Println(a == b)
```

Два интерфейса можно сравнивать только если конкретный тип — comparable.

### Ловушка 4: Интерфейс в map как ключ

```go
// Аналогично сравнению: работает только если конкретный тип comparable
m := map[any]int{}
m[42] = 1     // ok: int comparable
m["hi"] = 2   // ok: string comparable
m[[]int{1}] = 3 // panic: unhashable type: []int
```

## Паттерн: Functional Options

Интерфейсы часто используются для реализации паттерна функциональных опций:

```go
type Server struct {
    host    string
    port    int
    timeout time.Duration
}

type Option func(*Server)

func WithTimeout(d time.Duration) Option {
    return func(s *Server) { s.timeout = d }
}

func WithPort(p int) Option {
    return func(s *Server) { s.port = p }
}

func NewServer(host string, opts ...Option) *Server {
    s := &Server{host: host, port: 8080, timeout: 30 * time.Second}
    for _, opt := range opts {
        opt(s)
    }
    return s
}

srv := NewServer("localhost", WithPort(9090), WithTimeout(60*time.Second))
```

## Итог

Интерфейсы в Go реализуются неявно, хранятся как пара указателей (itab + data). nil-интерфейс и интерфейс с nil-значением — это принципиально разные вещи. Type assertion и type switch позволяют работать с конкретными типами. Ключевые стандартные интерфейсы: `io.Reader`, `io.Writer`, `error`, `fmt.Stringer`. Следуйте принципу маленьких, сфокусированных интерфейсов. С Go 1.18 интерфейсы также используются как ограничения типов в дженериках.
