---
title: Maps in Go
blockId: primitives-maps
parentBlockId: primitives
---

# Maps in Go

A map is a hash table. In Go it is a built-in type that provides amortized O(1) insert, delete, and lookup operations. Despite being straightforward to use, maps have several important characteristics that appear regularly in interviews.

## Internal Structure

The Go runtime implements a map as an array of **buckets**. Each bucket holds up to 8 key-value pairs. When a key is hashed, the low-order bits of the hash select the bucket; the high-order bits (tophash) are used for fast comparison within the bucket.

Starting with Go 1.24, the runtime map uses **Swiss Tables** — a more efficient implementation borrowed from Abseil (C++). Swiss Tables use SIMD instructions where available, providing a performance improvement for large maps.

```
map[string]int{"a": 1, "b": 2, "c": 3}

Hash table:
┌─────────┬─────────┬─────────┐
│ bucket0 │ bucket1 │ bucket2 │ ...
└────┬────┴─────────┴─────────┘
     │
     ▼
┌──────────────────┐
│ tophash[8]       │  high hash bits for fast comparison
│ keys[8]          │  keys
│ values[8]        │  values
│ overflow *bucket │  overflow chain
└──────────────────┘
```

When the **load factor** reaches approximately 6.5 (average entries per bucket), the map grows: a new bucket array twice as large is created, and elements are migrated incrementally so that operations are not blocked.

## Iteration Order Is Intentionally Randomized

The order of map iteration in Go is intentionally randomized on every run:

```go
m := map[string]int{"a": 1, "b": 2, "c": 3}

// Different order each time
for k, v := range m {
    fmt.Printf("%s: %d\n", k, v)
}
```

This has been deliberate since Go 1.0, to prevent developers from relying on a specific iteration order. In practice the order might occasionally be stable under certain conditions, but that is an implementation detail — never rely on it.

For ordered iteration, explicitly sort the keys:

```go
m := map[string]int{"banana": 2, "apple": 1, "cherry": 3}

keys := slices.Collect(maps.Keys(m)) // Go 1.23: maps.Keys returns iter.Seq[K]
slices.Sort(keys)

for _, k := range keys {
    fmt.Printf("%s: %d\n", k, m[k])
}
```

## Creating and Initializing Maps

```go
// Literal
m := map[string]int{"a": 1, "b": 2}

// make with size hint
m = make(map[string]int)
m = make(map[string]int, 100) // hint for initial capacity

// nil map
var m2 map[string]int // m2 == nil
```

### nil Map vs Empty Map

```go
var m map[string]int // nil map

// Reading from a nil map is safe — returns zero value
v := m["key"] // v = 0, no panic

// Writing to a nil map panics!
m["key"] = 1 // panic: assignment to entry in nil map

// Correct: always initialize before writing
m = make(map[string]int)
m["key"] = 1
```

## Basic Operations

```go
m := map[string]int{}

// Insert / update
m["alice"] = 30
m["bob"] = 25

// Read
age := m["alice"]           // 30
age = m["charlie"]          // 0 — zero value, not an error

// Existence check
age, ok := m["charlie"]
if !ok {
    fmt.Println("charlie not found") // charlie not found
}

// Delete
delete(m, "alice")
delete(m, "nonexistent") // ok, no panic

// Count
fmt.Println(len(m)) // 1

// Clear (Go 1.21)
clear(m) // removes all entries, m != nil
fmt.Println(len(m)) // 0
```

## Concurrent Access

Maps in Go are **not goroutine-safe**. Concurrent access without synchronization causes a data race and a runtime panic:

```go
m := map[string]int{}

// DANGEROUS: data race
go func() { m["a"] = 1 }()
go func() { m["b"] = 2 }()

// The runtime detects concurrent access and panics:
// fatal error: concurrent map read and map write
```

### Synchronization via sync.RWMutex

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

`sync.Map` is optimized for two scenarios:
1. Write once, read many times (read-heavy, stable keys)
2. Concurrent writes to disjoint sets of keys

```go
var sm sync.Map

// Store
sm.Store("key", 42)

// Load
v, ok := sm.Load("key")
if ok {
    fmt.Println(v.(int)) // 42
}

// LoadOrStore — atomic operation
actual, loaded := sm.LoadOrStore("key2", 100)
// loaded=false, actual=100

// Delete
sm.Delete("key")

// Range
sm.Range(func(key, value any) bool {
    fmt.Printf("%v: %v\n", key, value)
    return true // return false to stop
})
```

`sync.Map` is not a drop-in replacement for a regular map in all cases: for high-frequency writes to the same key, `mutex + map` will be more efficient.

## The maps Package (Go 1.21+)

The `maps` package provides type-safe utilities for working with maps.

### maps.Clone

```go
original := map[string]int{"a": 1, "b": 2, "c": 3}
clone := maps.Clone(original)

clone["d"] = 4
fmt.Println(original) // map[a:1 b:2 c:3] — unchanged
```

Note: this is a **shallow** copy. If values are pointers or slices, they will be shared.

### maps.Copy

```go
dst := map[string]int{"x": 10}
src := map[string]int{"a": 1, "b": 2, "x": 99}

maps.Copy(dst, src)
fmt.Println(dst) // map[a:1 b:2 x:99] — x was overwritten
```

### maps.DeleteFunc

```go
m := map[string]int{"a": 1, "b": -2, "c": 3, "d": -4}

// Delete all negative values
maps.DeleteFunc(m, func(key string, val int) bool {
    return val < 0
})
fmt.Println(m) // map[a:1 c:3]
```

### maps.Keys and maps.Values (Go 1.23)

In Go 1.23, `maps.Keys` and `maps.Values` return `iter.Seq` iterators:

```go
m := map[string]int{"a": 1, "b": 2, "c": 3}

// Iterate over keys
for k := range maps.Keys(m) {
    fmt.Println(k)
}

// Collect into slice via slices.Collect
keys := slices.Collect(maps.Keys(m))
slices.Sort(keys)

values := slices.Collect(maps.Values(m))
```

### maps.Equal and maps.EqualFunc

```go
m1 := map[string]int{"a": 1, "b": 2}
m2 := map[string]int{"a": 1, "b": 2}
m3 := map[string]int{"a": 1, "b": 3}

maps.Equal(m1, m2) // true
maps.Equal(m1, m3) // false

// With custom comparator
maps.EqualFunc(m1, m3, func(v1, v2 int) bool {
    return abs(v1-v2) <= 1 // "approximately equal"
})
```

## clear (Go 1.21)

The built-in `clear` function removes all entries from a map (unlike reassigning to a new map):

```go
m := map[string]int{"a": 1, "b": 2}
clear(m)
fmt.Println(len(m))   // 0
fmt.Println(m == nil) // false — map exists, just empty

// Unlike:
m = make(map[string]int) // recreation — new allocation
```

Use `clear` when you want to reuse a map (avoid allocation) rather than creating a new one.

## Common Patterns

### Frequency Counter

```go
func charFrequency(s string) map[rune]int {
    freq := make(map[rune]int)
    for _, r := range s {
        freq[r]++
    }
    return freq
}
```

### Grouping

```go
func groupByAge(people []Person) map[int][]Person {
    groups := make(map[int][]Person)
    for _, p := range people {
        groups[p.Age] = append(groups[p.Age], p)
    }
    return groups
}
```

### Cache / Memoization

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

### Set via Map

Go has no built-in Set type. The conventional pattern uses `map[T]struct{}`:

```go
type Set[T comparable] map[T]struct{}

func (s Set[T]) Add(v T)           { s[v] = struct{}{} }
func (s Set[T]) Contains(v T) bool { _, ok := s[v]; return ok }
func (s Set[T]) Remove(v T)        { delete(s, v) }
func (s Set[T]) Len() int          { return len(s) }
```

### GetOrDefault Pattern

```go
func getOrDefault[K comparable, V any](m map[K]V, key K, defaultVal V) V {
    if v, ok := m[key]; ok {
        return v
    }
    return defaultVal
}

// Or with cmp.Or (Go 1.22+) — only for zero-comparable defaults
result := cmp.Or(m["key"], "default")
```

## Map Keys

Any **comparable** type can be a key: numbers, strings, booleans, pointers, arrays (if elements are comparable), structs (if all fields are comparable).

Not allowed: slices, functions, other maps.

```go
// Struct as key
type Point struct{ X, Y int }
distances := map[Point]float64{
    {0, 0}: 0,
    {3, 4}: 5,
}

// Array as key (fixed size)
pairs := map[[2]string]int{
    {"a", "b"}: 1,
    {"c", "d"}: 2,
}
```

## Common Pitfalls

### Pitfall 1: Writing to a nil Map

```go
var m map[string]int
m["key"] = 1 // panic: assignment to entry in nil map
```

### Pitfall 2: Modifying a Struct Value in a Map

```go
type Counter struct{ Count int }
m := map[string]Counter{"a": {Count: 0}}

m["a"].Count++ // compile error!
// cannot assign to struct field in map

// Correct:
c := m["a"]
c.Count++
m["a"] = c

// Or use pointers:
m2 := map[string]*Counter{"a": {Count: 0}}
m2["a"].Count++ // ok
```

### Pitfall 3: Deleting Elements During Iteration

```go
m := map[string]int{"a": 1, "b": 2, "c": 3}

// SAFE in Go: deleting elements during range
for k, v := range m {
    if v > 1 {
        delete(m, k) // allowed in Go
    }
}
```

This is safe in Go — `range` takes a snapshot of the keys to iterate before starting.

### Pitfall 4: Existence Check via Zero Value

```go
m := map[string]int{"present": 0}

// BAD: cannot distinguish "key missing" from "value is 0"
if m["missing"] == 0 {
    // both "missing" and "present" end up here!
}

// GOOD: two-value assignment
if v, ok := m["present"]; ok {
    fmt.Println("found:", v) // found: 0
}
```

## Summary

Maps in Go are hash tables with amortized O(1) operations. Iteration order is randomized. Concurrent access without synchronization causes a panic — use `sync.RWMutex` or `sync.Map`. The built-in `clear` function (Go 1.21) empties a map without recreation. The `maps` package provides `maps.Clone`, `maps.Copy`, `maps.DeleteFunc`, and since Go 1.23 `maps.Keys` and `maps.Values` as iterators. Always initialize a map before writing — writing to a nil map panics.
