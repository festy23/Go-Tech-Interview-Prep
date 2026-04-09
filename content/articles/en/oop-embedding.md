---
title: Embedding in Go
blockId: oop-embedding
parentBlockId: oop
---

# Embedding in Go

Embedding is a mechanism that lets one type include another type without explicit inheritance. It is the primary code-reuse technique in Go. In interviews, embedding is frequently confused with inheritance — they are fundamentally different things, and being able to explain the distinction is valued.

## Struct Embedding

Embedding is declared as a field with no name — just a type:

```go
type Base struct {
    ID        int64
    CreatedAt time.Time
}

func (b Base) Age() time.Duration {
    return time.Since(b.CreatedAt)
}

type Article struct {
    Base           // embedding — a nameless field
    Title   string
    Content string
}
```

`Article` now automatically has all the fields and methods of `Base`:

```go
a := Article{
    Base:    Base{ID: 1, CreatedAt: time.Now()},
    Title:   "Embedding in Go",
    Content: "...",
}

fmt.Println(a.ID)       // 1 — Base.ID promoted
fmt.Println(a.Age())    // Base.Age() promoted
fmt.Println(a.Base.ID)  // explicit access also works
```

Promotion is syntactic sugar: the compiler expands `a.ID` into `a.Base.ID` and `a.Age()` into `a.Base.Age()`. No new type is created, and there is no vtable.

## Method Promotion

Both fields and methods are promoted. If the embedded type satisfies an interface, the outer type satisfies it too (provided there are no name conflicts):

```go
type Logger interface {
    Log(msg string)
}

type StdLogger struct{}

func (l StdLogger) Log(msg string) {
    fmt.Println(msg)
}

type Service struct {
    StdLogger          // Service now satisfies Logger
    Name string
}

var _ Logger = Service{}  // compiler confirms

svc := Service{Name: "payments"}
svc.Log("started")  // calls StdLogger.Log
```

This is a powerful mechanism: you can mix behavior into a type by simply embedding the right type.

## Shadowing — Overriding Methods

If the outer type declares a method with the same name as the embedded type, the outer method shadows the embedded one:

```go
type Animal struct{ Name string }

func (a Animal) Speak() string { return "..." }

type Cat struct {
    Animal
}

func (c Cat) Speak() string {
    return c.Name + " says: meow"
}

// Dog does not override Speak
type Dog struct {
    Animal
}

cat := Cat{Animal: Animal{Name: "Whiskers"}}
dog := Dog{Animal: Animal{Name: "Rex"}}

fmt.Println(cat.Speak()) // Whiskers says: meow — Cat's method
fmt.Println(dog.Speak()) // ... — promoted Animal method
```

Important: shadowing does not affect access via the embedded field's explicit name. `cat.Animal.Speak()` calls `Animal.Speak`, bypassing `Cat.Speak`.

This is different from overriding in OOP languages: Go has no virtual methods, so there is no dynamic dispatch through the embedded field's type.

## Embedding Interfaces in Structs

A struct can embed an interface. The struct then automatically satisfies that interface, but each method panics by default (nil pointer):

```go
type Handler interface {
    Handle(req Request) Response
}

type LoggingHandler struct {
    Handler              // embedded interface
    logger *slog.Logger
}

func (h *LoggingHandler) Handle(req Request) Response {
    h.logger.Info("handling request", "path", req.Path)
    resp := h.Handler.Handle(req)  // delegate to the embedded handler
    h.logger.Info("done", "status", resp.Status)
    return resp
}
```

This is the **Decorator** pattern: `LoggingHandler` wraps any `Handler` and adds logging. The concrete handler is provided from outside:

```go
var base Handler = &MyHandler{}
logged := &LoggingHandler{Handler: base, logger: slog.Default()}
```

Embedding an interface in a struct is also used as a stub in tests: when you need a mock implementing a large interface but the test only exercises a couple of methods:

```go
type bigInterface interface {
    MethodA() error
    MethodB() string
    MethodC(int) bool
    // ... 10 more methods
}

type partialMock struct {
    bigInterface              // embedded interface = zero implementation for the rest
}

func (m *partialMock) MethodA() error { return nil }  // only the method we care about
```

Note: calling any non-overridden method will panic (nil pointer dereference). This is acceptable in tests but not in production code.

## Embedding Interfaces in Interfaces

An interface can embed other interfaces. This is standard practice in the standard library:

```go
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}

type ReadWriter interface {
    Reader  // embedded
    Writer  // embedded
}

type ReadWriteCloser interface {
    ReadWriter  // embedded
    Closer      // embedded
}
```

This approach builds interfaces from small building blocks without duplication. A function that only needs `Reader` does not depend on `Writer`.

## Embedding Pointers

You can embed either a value type or a pointer to a type:

```go
type A struct{ x int }
func (a *A) Inc() { a.x++ }

// embedding a value
type B struct{ A }

// embedding a pointer
type C struct{ *A }
```

When embedding a pointer, you must explicitly initialize the field, or any method call will panic:

```go
b := B{A: A{x: 1}}
b.Inc()        // ok — B.A is initialized

c := C{A: &A{x: 1}}
c.Inc()        // ok — C.A is a pointer, explicitly initialized

c2 := C{}
c2.Inc()       // panic: nil pointer dereference — C.A == nil
```

## Embedding vs. Named Field

Embedding is not the same as a named field of the same type. The difference is in promotion:

```go
type WithEmbedding struct {
    Base            // promotes fields and methods
}

type WithNamedField struct {
    base Base       // promotes nothing
}

we := WithEmbedding{Base: Base{ID: 1}}
wn := WithNamedField{base: Base{ID: 1}}

we.ID    // ok — promoted
we.Age() // ok — promoted

wn.ID    // compile error: no field ID
wn.Age() // compile error: no method Age
wn.base.ID    // ok — explicit access
```

## When to Use Embedding vs. a Named Field

| Situation | Recommendation |
|---|---|
| Mixing in behavior (logging, metrics) | Embedding |
| Building a decorator / middleware | Interface embedding |
| Expressing an "is-a" relationship | Embedding (use with care) |
| Expressing a "has-a" relationship | Named field |
| Need to control the field's public API | Named field |
| The field is an implementation detail | Named field |

The key rule: if method promotion is the desired behavior, use embedding. If you just want to store data, use a named field.

## Common Pitfalls

**1. Unexpected method promotion.** An embedded type satisfies an interface, and the outer type satisfies it too — even if that was not the intent. This can be a surprise during refactoring.

**2. Name conflicts.** If two embedded types have a field or method with the same name, the compiler requires an explicit selector:

```go
type A struct{ Name string }
type B struct{ Name string }

type C struct{ A; B }

c := C{}
// c.Name       // compile error: ambiguous selector
c.A.Name = "a" // ok
c.B.Name = "b" // ok
```

**3. Mutations through an embedded value.** If you embed a value (not a pointer), a value-receiver method operates on a copy. Mutations are not visible on the outer type. Embed a pointer if mutations via the embedded method are needed.

Embedding is a powerful Go tool for building flexible composite types without inheritance. It underpins many patterns covered in the "Design Patterns in Go" article.
