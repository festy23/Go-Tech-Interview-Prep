---
title: Встраивание в Go
blockId: oop-embedding
parentBlockId: oop
---

# Встраивание в Go

Встраивание (embedding) — механизм, позволяющий одному типу включать другой тип без явного наследования. Это основной способ повторного использования кода в Go. На собеседованиях часто путают встраивание с наследованием — это принципиально разные вещи, и умение объяснить разницу ценится высоко.

## Встраивание структур

Встраивание объявляется как поле без имени — только тип:

```go
type Base struct {
    ID        int64
    CreatedAt time.Time
}

func (b Base) Age() time.Duration {
    return time.Since(b.CreatedAt)
}

type Article struct {
    Base           // встраивание — поле без имени
    Title   string
    Content string
}
```

Теперь `Article` автоматически получает все поля и методы `Base`:

```go
a := Article{
    Base:    Base{ID: 1, CreatedAt: time.Now()},
    Title:   "Встраивание в Go",
    Content: "...",
}

fmt.Println(a.ID)       // 1 — поле Base.ID продвинуто
fmt.Println(a.Age())    // метод Base.Age() продвинут
fmt.Println(a.Base.ID)  // явный доступ тоже работает
```

Продвижение (promotion) — это синтаксический сахар: компилятор разворачивает `a.ID` в `a.Base.ID`, а `a.Age()` — в `a.Base.Age()`. Никакого нового типа не создаётся, никакой vtable нет.

## Продвижение методов

Продвигаются и поля, и методы. Если встроенный тип реализует интерфейс, внешний тип тоже реализует этот интерфейс (при условии, что нет конфликтов имён):

```go
type Logger interface {
    Log(msg string)
}

type StdLogger struct{}

func (l StdLogger) Log(msg string) {
    fmt.Println(msg)
}

type Service struct {
    StdLogger          // Service теперь реализует Logger
    Name string
}

var _ Logger = Service{}  // компилятор подтверждает

svc := Service{Name: "payments"}
svc.Log("started")  // вызывает StdLogger.Log
```

Это мощный механизм: можно «примешать» поведение к типу, просто встроив нужный тип.

## Shadowing — переопределение методов

Если внешний тип объявляет метод с тем же именем, что и встроенный, — внешний метод «затеняет» встроенный:

```go
type Animal struct{ Name string }

func (a Animal) Speak() string { return "..." }

type Cat struct {
    Animal
}

func (c Cat) Speak() string {
    return c.Name + " says: meow"
}

// Dog не переопределяет Speak
type Dog struct {
    Animal
}

cat := Cat{Animal: Animal{Name: "Whiskers"}}
dog := Dog{Animal: Animal{Name: "Rex"}}

fmt.Println(cat.Speak()) // Whiskers says: meow — метод Cat
fmt.Println(dog.Speak()) // ... — продвинутый метод Animal
```

Важно: затенение не влияет на доступ через явное имя встроенного поля. `cat.Animal.Speak()` вызовет именно `Animal.Speak`, минуя `Cat.Speak`.

Это отличие от переопределения в объектно-ориентированных языках: в Go нет виртуальных методов, а значит, нет динамической диспетчеризации через тип встроенного поля.

## Встраивание интерфейсов в структуры

Структура может встраивать интерфейс. Тогда структура автоматически реализует этот интерфейс, но каждый метод по умолчанию паникует (nil-указатель):

```go
type Handler interface {
    Handle(req Request) Response
}

type LoggingHandler struct {
    Handler              // встроенный интерфейс
    logger *slog.Logger
}

func (h *LoggingHandler) Handle(req Request) Response {
    h.logger.Info("handling request", "path", req.Path)
    resp := h.Handler.Handle(req)  // делегирование встроенному хендлеру
    h.logger.Info("done", "status", resp.Status)
    return resp
}
```

Это паттерн **декоратора**: `LoggingHandler` оборачивает произвольный `Handler`, добавляя логирование. Конкретный хендлер передаётся извне:

```go
var base Handler = &MyHandler{}
logged := &LoggingHandler{Handler: base, logger: slog.Default()}
```

Встраивание интерфейса в структуру используется и как «заглушка» в тестах: если нужен мок, реализующий большой интерфейс, но тест проверяет только пару методов:

```go
type bigInterface interface {
    MethodA() error
    MethodB() string
    MethodC(int) bool
    // ... ещё 10 методов
}

type partialMock struct {
    bigInterface              // встроенный интерфейс = нулевая реализация остальных
}

func (m *partialMock) MethodA() error { return nil }  // только нужный метод
```

Внимание: вызов любого непереопределённого метода вызовет панику (nil pointer dereference). Это приемлемо в тестах, но не в production-коде.

## Встраивание интерфейсов в интерфейсы

Интерфейс может встраивать другие интерфейсы. Это стандартная практика стандартной библиотеки:

```go
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}

type ReadWriter interface {
    Reader  // встроен
    Writer  // встроен
}

type ReadWriteCloser interface {
    ReadWriter  // встроен
    Closer      // встроен
}
```

Такой подход позволяет строить интерфейсы из небольших кирпичиков без дублирования. Функция, которой нужен только `Reader`, не зависит от `Writer`.

## Встраивание указателей

Можно встраивать как значение типа, так и указатель на тип:

```go
type A struct{ x int }
func (a *A) Inc() { a.x++ }

// встраивание значения
type B struct{ A }

// встраивание указателя
type C struct{ *A }
```

При встраивании указателя нужно явно инициализировать поле, иначе вызов любого метода вызовет панику:

```go
b := B{A: A{x: 1}}
b.Inc()        // ok — B.A инициализирован

c := C{A: &A{x: 1}}
c.Inc()        // ok — C.A является указателем, инициализированным явно

c2 := C{}
c2.Inc()       // panic: nil pointer dereference — C.A == nil
```

## Разница между встраиванием и именованным полем

Встраивание — это не то же самое, что именованное поле того же типа. Разница в продвижении:

```go
type WithEmbedding struct {
    Base            // продвигает методы и поля
}

type WithNamedField struct {
    base Base       // не продвигает ничего
}

we := WithEmbedding{Base: Base{ID: 1}}
wn := WithNamedField{base: Base{ID: 1}}

we.ID    // ok — продвинуто
we.Age() // ok — продвинуто

wn.ID    // ошибка компиляции: нет поля ID
wn.Age() // ошибка компиляции: нет метода Age
wn.base.ID    // ok — явный доступ
```

## Когда использовать встраивание, а когда — именованное поле

| Ситуация | Рекомендация |
|---|---|
| Хочу «примешать» поведение (логирование, метрики) | Встраивание |
| Строю декоратор/middleware | Встраивание интерфейса |
| Отношение «is-a» | Встраивание (с осторожностью) |
| Отношение «has-a» | Именованное поле |
| Нужен контроль над интерфейсом конкретного поля | Именованное поле |
| Поле — деталь реализации, не часть публичного API | Именованное поле |

Главное правило: если продвижение методов — желательное поведение, используйте встраивание. Если вы просто хотите хранить данные, используйте именованное поле.

## Распространённые ловушки

**1. Неожиданное продвижение методов.** Встроенный тип реализует интерфейс, и внешний тип тоже его реализует — даже если это не было целью. Это может стать сюрпризом при рефакторинге.

**2. Конфликт имён.** Если два встроенных типа имеют поле или метод с одинаковым именем — компилятор потребует явного указания:

```go
type A struct{ Name string }
type B struct{ Name string }

type C struct{ A; B }

c := C{}
// c.Name       // ошибка компиляции: ambiguous selector
c.A.Name = "a" // ok
c.B.Name = "b" // ok
```

**3. Мутации через встроенное значение.** Если встраивается значение (не указатель), метод с value receiver работает на копии. Мутации не видны снаружи. Используйте встраивание указателя, если нужна мутация через встроенный метод.

Встраивание — мощный инструмент Go, позволяющий строить гибкие составные типы без наследования. Оно лежит в основе многих паттернов, рассмотренных в статье «Паттерны проектирования в Go».
