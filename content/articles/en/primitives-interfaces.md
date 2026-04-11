---
title: Interfaces in Go
blockId: primitives-interfaces
parentBlockId: primitives
---

# Interfaces in Go

Interfaces are one of the most powerful and simultaneously most subtle mechanisms in Go. They provide polymorphism without an inheritance hierarchy, follow the "duck typing" principle, and underpin packages such as `io`, `fmt`, and `sort`. Interfaces are a mandatory topic in any Go interview.

## Implicit Implementation

In Go an interface is implemented **implicitly**: there is no `implements` declaration. You just implement all the methods the interface requires:

```go
type Animal interface {
    Sound() string
    Name() string
}

type Dog struct{}

func (d Dog) Sound() string { return "Woof" }
func (d Dog) Name() string  { return "Dog" }

// Dog automatically satisfies Animal
var a Animal = Dog{}
fmt.Println(a.Sound()) // Woof
```

This is a fundamental difference from Java/C#, where you must write `implements`. In Go an interface is a contract that a type can satisfy without ever knowing the interface exists.

## Internal Structure

An interface in memory is a struct of two pointers:

```go
// Simplified:
type iface struct {
    tab  *itab          // pointer to the method table
    data unsafe.Pointer // pointer to the data
}

type itab struct {
    inter *interfacetype // interface descriptor
    _type *_type         // concrete value type
    hash  uint32         // type hash
    fun   [...]uintptr   // method table
}
```

Calling a method through an interface is an indirect call through the method table (`fun`). This is more expensive than a direct call but faster than reflection.

`tab == nil` means a nil interface (contains neither type nor value).

## nil Interface vs Interface Holding nil

This is the most common pitfall when working with interfaces:

```go
type MyError struct{ msg string }
func (e *MyError) Error() string { return e.msg }

func getError(fail bool) error {
    var err *MyError // nil pointer of type *MyError
    if fail {
        err = &MyError{"something failed"}
    }
    return err // WARNING: does not return a nil interface!
}

e := getError(false)
fmt.Println(e == nil) // false! Not nil!
```

Why? Because `e` is an `error` interface holding `(*MyError)(nil)`. The interface contains a type (`*MyError`) and a value (`nil`). That is not a nil interface.

```
nil interface:              interface holding nil value:
┌──────┬──────┐           ┌────────────┬──────┐
│ tab  │ nil  │           │ *itab(err) │ nil  │
│ data │ nil  │           │            │      │
└──────┴──────┘           └────────────┴──────┘
   == nil: true               == nil: false
```

**Rule**: never return a concrete nil pointer through an interface. To return nil through an interface, use an explicit nil:

```go
func getError(fail bool) error {
    if fail {
        return &MyError{"something failed"}
    }
    return nil // explicit nil interface
}
```

## The Empty Interface: any

`interface{}` (aliased as `any` since Go 1.18) accepts a value of any type:

```go
var x any = 42
x = "hello"
x = []int{1, 2, 3}

// any is used where the type is not known in advance
func printAll(values []any) {
    for _, v := range values {
        fmt.Println(v)
    }
}
```

`any` gives no access to the concrete type's methods — you need type assertion or type switch.

## Type Assertion

A type assertion extracts the concrete value from an interface:

```go
var i any = "hello"

// Unsafe — panics if the type does not match
s := i.(string)
fmt.Println(s) // hello

// Safe — comma-ok idiom
s, ok := i.(string)
if !ok {
    fmt.Println("not a string")
}

// Error:
n := i.(int) // panic: interface conversion: interface {} is string, not int
```

A type assertion does not cast a type — it extracts a concrete value. It works only on interfaces.

## Type Switch

A type switch branches on the type of a value:

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

This is the idiomatic way to handle multiple types in Go. In each case clause, `v` has the concrete type.

## Standard Interfaces

### io.Reader and io.Writer

The two most important interfaces in the standard library:

```go
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}
```

The entire I/O system in Go is built around these interfaces: files, network connections, buffers, gzip, crypto — everything implements `io.Reader` or `io.Writer`.

```go
// Any Reader can be passed to io.Copy
func copyData(dst io.Writer, src io.Reader) (int64, error) {
    return io.Copy(dst, src)
}

// Works with files, HTTP bodies, bytes.Buffer, strings.Reader...
io.Copy(os.Stdout, strings.NewReader("hello"))
io.Copy(file, resp.Body)
io.Copy(&buf, os.Stdin)
```

### error

The `error` interface is one of the simplest:

```go
type error interface {
    Error() string
}
```

Any type with an `Error() string` method implements `error`. This allows creating rich error types:

```go
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation error on %s: %s", e.Field, e.Message)
}

// Usage
var err error = &ValidationError{Field: "email", Message: "invalid format"}

// Unwrapping via errors.AsType (Go 1.26)
if ve, ok := errors.AsType[*ValidationError](err); ok {
    fmt.Println(ve.Field) // email
}
```

### fmt.Stringer

Interface for string representation:

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

fmt.Println(Red)          // Red — fmt calls String() automatically
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

Although for most cases it is now simpler to use `slices.SortFunc` with generics.

## Interface as a Contract

Go follows the **Interface Segregation Principle**: small, focused interfaces are better than large ones. Compare:

```go
// Bad: monolithic interface
type Storage interface {
    Read(id string) ([]byte, error)
    Write(id string, data []byte) error
    Delete(id string) error
    List() ([]string, error)
    Stats() StorageStats
}

// Good: split into parts
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

Functions accept the minimum necessary interface:

```go
func processItem(r Reader, id string) error { ... }
func backupData(l Lister, r Reader, w Writer) error { ... }
```

## Interfaces and Generics

Since Go 1.18, interfaces have a new role — type constraints:

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

The built-in `cmp` package defines `cmp.Ordered`, used throughout the `slices` and `maps` standard packages.

## Embedding Interfaces

Interfaces can be embedded in other interfaces:

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

The standard library uses this extensively: `io.ReadWriter`, `io.ReadWriteCloser`, `io.ReadWriteSeeker`, etc.

## Compile-Time Interface Check

The idiomatic way to verify that a type implements an interface at compile time:

```go
// This line causes a compile error if Dog does not implement Animal
var _ Animal = (*Dog)(nil)
var _ Animal = Dog{} // if methods are on the value, not pointer
```

This is especially useful in large codebases where the interface and its implementations may be in different packages.

## Common Pitfalls

### Pitfall 1: Pointer Receiver vs Value Receiver

```go
type Writer struct{ buf []byte }

// Method on pointer
func (w *Writer) Write(p []byte) (n int, err error) {
    w.buf = append(w.buf, p...)
    return len(p), nil
}

var w Writer
var iw io.Writer = &w     // ok: *Writer implements io.Writer
// var iw io.Writer = w   // error! Writer does not implement io.Writer (*Writer needed)
```

Rule: if a method is defined on `*T`, only `*T` satisfies the interface. `T` does not.

### Pitfall 2: Interface Calls and Invisible Allocations

```go
// Calling a method through an interface requires escape analysis
// The concrete value may be allocated on the heap
func process(r io.Reader) { ... }

buf := bytes.NewReader(data)
process(buf) // buf is passed through an interface — possible allocation
```

In hot paths, consider passing the concrete type directly.

### Pitfall 3: Comparing Interfaces May Panic

```go
var a, b any

a = []int{1, 2, 3}
b = []int{1, 2, 3}

// panic: runtime error: comparing uncomparable type []int
fmt.Println(a == b)
```

Two interfaces can only be compared if the concrete type is comparable.

### Pitfall 4: Interface as Map Key

```go
// Same as comparison: works only if the concrete type is comparable
m := map[any]int{}
m[42] = 1       // ok: int is comparable
m["hi"] = 2     // ok: string is comparable
m[[]int{1}] = 3 // panic: unhashable type: []int
```

## Pattern: Functional Options

Interfaces are often used to implement the functional options pattern:

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

## Summary

Interfaces in Go are implemented implicitly and are stored as two-pointer pairs (itab + data). A nil interface and an interface holding a nil value are fundamentally different things. Type assertion and type switch let you work with concrete types. Key standard interfaces: `io.Reader`, `io.Writer`, `error`, `fmt.Stringer`. Follow the principle of small, focused interfaces. Since Go 1.18, interfaces also serve as type constraints in generics.
