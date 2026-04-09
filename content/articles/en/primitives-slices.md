---
title: Slices in Go
blockId: primitives-slices
parentBlockId: primitives
---

# Slices in Go

Slices are Go's primary data structure. They appear in function arguments, return values, and struct fields everywhere. Understanding how slices work internally is essential for writing correct code and passing any Go technical interview.

## Internal Structure

A slice is not an array. A slice is a **header** consisting of three fields:

```go
type SliceHeader struct {
    Data unsafe.Pointer // pointer to the first element in the underlying array
    Len  int            // number of elements accessible through the slice
    Cap  int            // number of elements from Data to the end of the underlying array
}
```

The underlying array is the actual data in memory. Multiple slices can point to the same array.

```go
a := [5]int{1, 2, 3, 4, 5}
s1 := a[1:4] // len=3, cap=4, points to a[1]
s2 := a[2:4] // len=2, cap=3, points to a[2]

s1[0] = 99
fmt.Println(a)    // [1 99 3 4 5] — a was modified!
fmt.Println(s2[0]) // 3 — s2[0] points to a[2], untouched
```

### Arrays vs Slices

| | Array | Slice |
|--|-------|-------|
| Type | `[N]T` | `[]T` |
| Size | Part of the type, fixed | Dynamic |
| Passed to function | Copy of all data | Copy of header (24 bytes) |
| nil | Not possible | Possible |
| Comparable | Yes (if T is comparable) | No |

```go
// Array is a value, always copied
var arr [3]int = [3]int{1, 2, 3}
arr2 := arr    // full copy
arr2[0] = 99
fmt.Println(arr) // [1 2 3] — unchanged

// Slice is a header; underlying array is not copied
s := []int{1, 2, 3}
s2 := s
s2[0] = 99
fmt.Println(s) // [99 2 3] — changed!
```

## Creating Slices

```go
// Literal
s := []int{1, 2, 3}          // len=3, cap=3

// make
s = make([]int, 5)            // len=5, cap=5, zero-filled
s = make([]int, 3, 10)        // len=3, cap=10

// Slice of array
a := [5]int{1, 2, 3, 4, 5}
s = a[1:3]                    // len=2, cap=4

// nil slice
var s2 []int                   // len=0, cap=0, s2 == nil

// Empty slice
s3 := []int{}                  // len=0, cap=0, s3 != nil
s4 := make([]int, 0)           // len=0, cap=0, s4 != nil
```

### nil Slice vs Empty Slice

```go
var nilSlice []int
emptySlice := []int{}

fmt.Println(nilSlice == nil)   // true
fmt.Println(emptySlice == nil) // false

// Both work fine with range, len, append
fmt.Println(len(nilSlice))    // 0
for range nilSlice {}          // ok, no panic

// But they differ in JSON marshaling
json.Marshal(nilSlice)   // null
json.Marshal(emptySlice) // []
```

For most purposes they are interchangeable. But if an API must return `[]` rather than `null` in JSON, use an empty slice.

## Mechanics of append

`append` is a function that may return a **different** slice:

```go
s := make([]int, 3, 5) // len=3, cap=5
s = append(s, 4)        // len=4, cap=5 — same underlying array
s = append(s, 5)        // len=5, cap=5 — same underlying array
s = append(s, 6)        // len=6, cap=10 — new array! cap roughly doubled
```

It is critical to always assign the result of `append` back to the variable:

```go
// Bug: append result is discarded
func addElement(s []int, elem int) {
    append(s, elem) // result thrown away!
}

// Correct:
func addElement(s []int, elem int) []int {
    return append(s, elem)
}
```

### Growth Strategy

Before Go 1.18, capacity doubled. Since Go 1.18 a smoother algorithm is used:

- For small slices: roughly doubling
- For large slices (1024+): roughly 25% growth

Exact values depend on element size and memory alignment.

### Appending Multiple Elements

```go
s := []int{1, 2, 3}

// Multiple elements at once
s = append(s, 4, 5, 6)

// Unpacking another slice
other := []int{7, 8, 9}
s = append(s, other...) // len=9
```

## Sub-slicing: Memory Leaks

A sub-slice does not copy data — it points into the same underlying array:

```go
big := make([]byte, 1<<20) // 1 MB
small := big[0:10]          // 10 bytes, but holds 1 MB in memory!
```

As long as `small` is alive, the entire `big` cannot be collected by the garbage collector.

The solution is to copy explicitly:

```go
small := make([]byte, 10)
copy(small, big[0:10])
// Now big can be collected by GC
```

Or use `slices.Clone`:

```go
small := slices.Clone(big[0:10])
```

### Three-Index Slicing

```go
// s[low:high:max] — limits cap
s := []int{1, 2, 3, 4, 5}
t := s[1:3:3] // len=2, cap=2 (not 4!)
```

This prevents the next `append` from writing into the original array.

## The slices Package (Go 1.21)

`slices` is a type-safe package for slice operations, built with generics.

### Sorting

```go
s := []int{3, 1, 4, 1, 5, 9, 2, 6}
slices.Sort(s) // sorts in-place
// [1 1 2 3 4 5 6 9]

// Sort with custom comparator
type Person struct{ Name string; Age int }
people := []Person{{"Alice", 30}, {"Bob", 25}}
slices.SortFunc(people, func(a, b Person) int {
    return cmp.Compare(a.Age, b.Age)
})

// Reverse sort
slices.SortFunc(s, func(a, b int) int {
    return cmp.Compare(b, a) // b and a swapped
})
```

### Search

```go
s := []int{1, 2, 3, 4, 5}

slices.Contains(s, 3)         // true
slices.Index(s, 3)            // 2 (index of first occurrence, -1 if absent)
slices.ContainsFunc(s, func(x int) bool { return x > 3 }) // true

// Binary search (requires sorted slice)
i, found := slices.BinarySearch(s, 3) // i=2, found=true
```

### Deduplication and Compaction

```go
s := []int{1, 1, 2, 3, 3, 3, 4}

// slices.Compact removes consecutive duplicates (like Unix uniq)
s = slices.Compact(s) // [1 2 3 4]

// For unsorted input, sort first:
unsorted := []int{3, 1, 2, 1, 3}
slices.Sort(unsorted)
unsorted = slices.Compact(unsorted) // [1 2 3]
```

### Clone and Clip

```go
original := []int{1, 2, 3, 4, 5}

// Clone — full copy (len and cap equal original's len)
clone := slices.Clone(original)

// Clip — removes excess capacity (sets cap = len)
s := original[:3] // len=3, cap=5
s = slices.Clip(s) // len=3, cap=3 — allows GC to collect the tail
```

### Reverse and Others

```go
s := []int{1, 2, 3, 4, 5}
slices.Reverse(s) // [5 4 3 2 1] — in-place

// Delete element by index (Go 1.21)
s = slices.Delete(s, 1, 2) // removes s[1:2]

// Insert elements
s = slices.Insert(s, 1, 99, 100) // inserts 99, 100 before s[1]

// Max/Min in a slice
m := slices.Max(s)
m = slices.Min(s)
```

## copy

`copy` copies elements between slices and returns the number copied:

```go
src := []int{1, 2, 3, 4, 5}
dst := make([]int, 3)
n := copy(dst, src) // n=3, dst=[1,2,3]

// copy is safe for overlapping slices
s := []int{1, 2, 3, 4, 5}
copy(s[1:], s[:4]) // s = [1, 1, 2, 3, 4]
```

## Slice Patterns

### In-Place Filtering without Allocation

```go
func filter[T any](s []T, keep func(T) bool) []T {
    result := s[:0] // reuse same underlying array
    for _, v := range s {
        if keep(v) {
            result = append(result, v)
        }
    }
    return result
}
```

Note: this is only safe if the original slice is no longer needed.

### Remove Element by Value

```go
func remove[T comparable](s []T, val T) []T {
    i := slices.Index(s, val)
    if i < 0 {
        return s
    }
    return slices.Delete(s, i, i+1)
}
```

### Deduplication

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

### Stack (LIFO)

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

### Queue (FIFO) — Inefficient via Slice

```go
var q []int

// Enqueue
q = append(q, 1)

// Dequeue — O(n)!
front := q[0]
q = q[1:]
```

For an efficient queue use `container/ring` or a hand-written ring buffer.

## Common Pitfalls

### Pitfall 1: append Modifies a Shared Underlying Array

```go
a := []int{1, 2, 3, 4, 5}
b := a[:3]   // [1 2 3], cap=5

b = append(b, 99) // len(b)=4, len(a)=5, but a[3] is now 99!
fmt.Println(a)    // [1 2 3 99 5]
```

Use three-index slicing or `slices.Clone`:

```go
b := slices.Clone(a[:3]) // independent copy
b = append(b, 99)        // does not affect a
```

### Pitfall 2: range Copies Each Element

```go
type Point struct{ X, Y int }
points := []Point{{1, 2}, {3, 4}}

for _, p := range points {
    p.X = 99 // modifies a copy, not the original!
}
fmt.Println(points) // [{1 2} {3 4}]

// Correct:
for i := range points {
    points[i].X = 99
}
```

### Pitfall 3: Index Panic When Accessing Beyond len

```go
s := make([]int, 3, 10)
s[5] = 1 // panic: index out of range!

// cap does not affect safe index access
// only append uses cap
```

### Pitfall 4: Goroutine Captures Loop Variable

In Go 1.22+ the loop variable is re-created each iteration:

```go
for i, v := range s {
    go func() {
        fmt.Println(i, v) // Go 1.22+: correct
    }()
}
```

Before Go 1.22 you had to pass as arguments:

```go
for i, v := range s {
    go func(i, v int) {
        fmt.Println(i, v)
    }(i, v)
}
```

## Performance

### Pre-allocating Capacity

```go
// Bad: many reallocations
result := []int{}
for i := range 10000 {
    result = append(result, i*i)
}

// Good: single allocation
result := make([]int, 0, 10000)
for i := range 10000 {
    result = append(result, i*i)
}
```

### Passing Slices to Functions

```go
// Slices are passed by value (header), but the underlying array is not copied
func sum(s []int) int {
    total := 0
    for _, v := range s {
        total += v
    }
    return total
}
// Passing []int{...} with a million elements copies only 24 bytes of header
```

## Summary

A slice in Go is a three-field header (data, len, cap) over an array. `append` may return a new slice with a different underlying array — always save the result. Sub-slices share memory with the original, which can cause memory leaks — use `slices.Clone` or `copy`. The `slices` package (Go 1.21) provides type-safe utilities: `slices.Sort`, `slices.Contains`, `slices.Compact`, `slices.Clip`, `slices.Clone`.
