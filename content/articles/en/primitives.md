---
title: Primitives in Go
blockId: primitives
parentBlockId: null
---

# Primitives in Go

Go is a statically typed language with a small core. The vast majority of programs are built on a handful of fundamental types: strings, slices, maps, and interfaces. Understanding how these types work under the hood is what separates a developer who just writes Go from one who writes efficient, predictable Go.

## Why Primitives Matter in Interviews

Go interviews rarely ask academic questions about type theory. What they do ask — very frequently — are practical problems that require knowing:

- What happens during `append` when a slice exhausts its capacity
- Why map iteration order is non-deterministic
- Why sub-slicing can cause a memory leak
- What a nil interface is and why `nil != nil` is a valid statement in Go
- How UTF-8 works and why `len(s)` is not the number of characters in a string

These are not academic questions. They are real pitfalls encountered in production code.

## Go's Type System

### Basic Types

Go divides types into several categories:

**Numeric**: `int`, `int8`, `int16`, `int32`, `int64`, `uint`, `uint8` (`byte`), `uint16`, `uint32`, `uint64`, `float32`, `float64`, `complex64`, `complex128`, `uintptr`

**String**: `string` — an immutable sequence of bytes encoded as UTF-8

**Boolean**: `bool`

**Composite**: arrays, slices, maps, structs, pointers, functions, channels, interfaces

### Numeric Types

`int` and `uint` are platform-dependent: on 64-bit systems they are 64 bits wide. Use `int64`, `int32`, etc. when you need explicit size control.

```go
var x int = 42
var y int64 = 42

// int and int64 are distinct types — explicit conversion required
z := int64(x) + y
```

Since Go 1.21, the built-in `min` and `max` functions work with any ordered type:

```go
a, b := 3, 7
fmt.Println(min(a, b)) // 3
fmt.Println(max(a, b)) // 7

// Also works with variadic slice expansion
nums := []int{5, 2, 8, 1}
fmt.Println(min(nums...)) // 1
```

### Constants and iota

Constants are evaluated at compile time and can be untyped:

```go
const Pi = 3.14159 // untyped constant

type Weekday int

const (
    Sunday Weekday = iota // 0
    Monday                // 1
    Tuesday               // 2
)
```

## Strings

A string in Go is an immutable slice of bytes. Operations like concatenation create a new string. Iterating over a string with `range` yields runes (Unicode code points), not bytes.

```go
s := "Hello, 世界"
fmt.Println(len(s))         // 13 — bytes, not characters
fmt.Println(len([]rune(s))) // 9  — characters

for i, r := range s {
    fmt.Printf("%d: %c\n", i, r)
}
```

The `strings` package has a rich set of utilities. Go 1.18 added `strings.Cut`, Go 1.20 added `strings.CutPrefix`, `strings.CutSuffix`, and `strings.Clone`. For efficient string construction, use `strings.Builder`.

See the **Strings** article for full details.

## Slices

A slice is a three-field header: a pointer to an underlying array, a length (`len`), and a capacity (`cap`). It is the primary data structure in Go, used virtually everywhere.

```go
s := make([]int, 3, 5) // len=3, cap=5
s = append(s, 10)      // len=4, cap=5
s = append(s, 20)      // len=5, cap=5
s = append(s, 30)      // len=6, cap=10 — reallocation!
```

The `slices` package (Go 1.21) provides type-safe utilities: `slices.Sort`, `slices.Contains`, `slices.Compact`, `slices.Clone`, `slices.Clip`.

See the **Slices** article for full details.

## Maps

A map in Go is a hash table. Iteration order is intentionally randomized. Concurrent access without synchronization causes a runtime panic.

```go
m := map[string]int{"a": 1, "b": 2}

// Safe read with existence check
v, ok := m["c"]
_ = v

// clear is a built-in function (Go 1.21)
clear(m) // removes all elements

// maps.Keys (Go 1.23)
keys := maps.Keys(m)
_ = keys
```

See the **Maps** article for full details.

## Interfaces

Interfaces in Go are implemented implicitly — you just implement the required methods. Internally, an interface is a pair of pointers: one to a method table (itab) and one to the data.

```go
type Stringer interface {
    String() string
}

type Point struct{ X, Y int }

func (p Point) String() string {
    return fmt.Sprintf("(%d, %d)", p.X, p.Y)
}

var s Stringer = Point{1, 2}
fmt.Println(s.String()) // (1, 2)
```

The most common pitfall is confusing a nil interface with an interface holding a nil pointer. These are two different things, and the confusion leads to hard-to-reproduce bugs.

See the **Interfaces** article for full details.

## Modern Go (1.21–1.25)

Recent Go versions have added many useful features:

| Version | Addition |
|---------|----------|
| 1.21 | `min`, `max`, `clear` builtins; `slices`, `maps`, `cmp` packages |
| 1.21 | `slices.Sort`, `slices.Contains`, `slices.Compact` |
| 1.22 | `for i := range n` — range over integers |
| 1.23 | `maps.Keys`, `maps.Values` return iterators |
| 1.24 | Runtime improvements, Swiss Tables for maps |
| 1.25 | Further performance improvements, `cmp.Or` |

The `for i := range n` loop replaces verbose `for i := 0; i < n; i++`:

```go
for i := range 5 {
    fmt.Println(i) // 0, 1, 2, 3, 4
}
```

`cmp.Or` returns the first non-zero value:

```go
name := cmp.Or(os.Getenv("NAME"), "anonymous")
```

## Common Interview Questions

**Most frequent topics:**

1. Difference between a `nil` slice and an empty slice (`[]int{}`)
2. What happens when you write to a nil map
3. Why you cannot concurrently read/write a map
4. Why `string([]byte{...})` is more expensive than it looks
5. How `append` works when capacity is exhausted
6. What a nil interface is and how it differs from an interface holding a nil value
7. How `range` iterates over a string (bytes or runes?)
8. What memory leak through sub-slicing means

**Typical problem:**

```go
func reverseWords(s string) string {
    words := strings.Fields(s)
    slices.Reverse(words) // Go 1.21
    return strings.Join(words, " ")
}
```

## Summary

Go primitives are not just syntax. Each has precise semantics and internal structure that directly affect performance and correctness. Strings are immutable and UTF-8. Slices are three-field headers over arrays. Maps are hash tables with intentionally randomized iteration. Interfaces are pointer pairs with implicit implementation.

Study the detailed articles for each type to be prepared for any interview question.
