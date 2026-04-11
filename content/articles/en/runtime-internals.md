---
title: Go Internals
blockId: runtime-internals
parentBlockId: runtime
---

## Introduction

Knowing the internal layout of Go's key data structures is what separates a developer who "just uses the language" from one who understands why code behaves the way it does. This topic surfaces in interviews both explicitly ("how is a map implemented in Go?") and indirectly ("why doesn't copying an interface copy the data?").

This article covers five structures: **map**, **slice**, **channel**, **interface**, and the mechanics of **defer/panic/recover**.

---

## Map: Hash Table with Buckets

### The hmap Struct

Every `map[K]V` in Go is a pointer to a `runtime.hmap` struct:

```go
// Simplified, from runtime/map.go
type hmap struct {
    count      int            // number of live elements (len(m))
    flags      uint8
    B          uint8          // log2 of bucket count: len(buckets) == 2^B
    noverflow  uint16         // approximate overflow bucket count
    hash0      uint32         // hash seed (randomisation)
    buckets    unsafe.Pointer // array of 2^B buckets
    oldbuckets unsafe.Pointer // old buckets during growth
    nevacuate  uintptr        // evacuation progress counter
    extra      *mapextra
}
```

### Buckets (bmap)

Each bucket holds exactly **8 key-value pairs**:

```
bmap:
  [tophash: 8 bytes]   — high 8 bits of each key's hash
  [keys:    8 * sizeof(K)]
  [values:  8 * sizeof(V)]
  [overflow: *bmap]    — pointer to an overflow bucket
```

`tophash` acts as a fast filter: the 8-bit hashes are compared first, and only on a match are the full keys compared. This reduces the number of expensive equality checks.

### Element Lookup

```
hash := hashfunc(key, m.hash0)
bucket := hash % (1 << m.B)
tophash := uint8(hash >> 56)

for each slot in buckets[bucket] and overflow buckets:
    if tophash[slot] == tophash and keys[slot] == key:
        return &values[slot]
```

### Map Growth

Growth is triggered in two scenarios:
1. **Load factor > 6.5** (elements / buckets > 6.5) — doubles the number of buckets.
2. **Too many overflow buckets** — evacuation without size increase (defragmentation).

Growth is **incremental**: each write operation evacuates 1–2 buckets from `oldbuckets` to `buckets`. This spreads the cost over time — there is no single large pause.

```go
// Iterating a map during growth is safe:
// the runtime handles concurrent access to old and new buckets
for k, v := range m {
    fmt.Println(k, v)
}
```

### Important Map Properties

- Maps are **not concurrency-safe** — concurrent writes cause a panic.
- Iteration order is **intentionally randomised** (hash0 is a random seed at creation).
- The zero value of a map is `nil`. Reading from a nil map is safe (returns zero value), writing to it panics.
- For concurrent access use `sync.Map` or `map + sync.RWMutex`.

---

## Slice: Three-Word Header

### The Slice Header Struct

A slice in Go is not a data type — it is a **three-field header**:

```go
// From reflect/value.go (simplified)
type SliceHeader struct {
    Data uintptr // pointer to the underlying array
    Len  int     // current length
    Cap  int     // capacity (from Data to end of array)
}
```

This means passing a slice to a function **copies the header** but not the data. The function operates on the same underlying memory.

```go
func modify(s []int) {
    s[0] = 999 // modifies the original array!
}

func main() {
    a := []int{1, 2, 3}
    modify(a)
    fmt.Println(a[0]) // 999
}
```

### append and Growth Strategy

`append` adds an element to a slice. If `len < cap` it simply increments `len`. If `len == cap` a reallocation is needed:

```go
// append behaviour:
// 1. len < cap → increment len, return same Data pointer
// 2. len == cap → allocate new array, copy, return new header
s := make([]int, 3, 5) // len=3, cap=5
s = append(s, 4)       // len=4, cap=5, same array
s = append(s, 5)       // len=5, cap=5, same array
s = append(s, 6)       // len=6, cap=10 (new array!)
```

**Growth strategy** (Go 1.18+, approximately):
- below 256 bytes: double (×2)
- above 256 bytes: grow by roughly 25% + a fixed amount

```go
// From runtime/slice.go (pseudocode):
func growslice(newLen int, oldCap int) int {
    newcap := oldCap
    doublecap := newcap + newcap
    if newLen > doublecap {
        return newLen // if you need a lot, take what you need
    }
    if oldCap < 256 {
        return doublecap // small slices: double
    }
    for newcap < newLen {
        // gradual slowdown: 1.25x + constant
        newcap += (newcap + 3*256) / 4
    }
    return newcap
}
```

### Slice Pitfalls

**Memory leak through sub-slice:**
```go
// Bad: the large array stays alive because of the sub-slice
func getFirst3(big []byte) []byte {
    return big[:3] // Data still points to the large array!
}

// Good: explicit copy
func getFirst3(big []byte) []byte {
    result := make([]byte, 3)
    copy(result, big[:3])
    return result
}
```

**Unexpected memory sharing:**
```go
a := []int{1, 2, 3, 4, 5}
b := a[1:3]       // b.Data = &a[1], b.Len=2, b.Cap=4
b = append(b, 99) // MODIFIES a[3]! cap allows writing into the original
fmt.Println(a)    // [1 2 3 99 5] — surprising!

// Protection via full slice expression:
b := a[1:3:3] // Cap=2, append will create a new array
```

---

## Channel: hchan and Wait Queues

### The hchan Struct

Every channel is a pointer to `runtime.hchan`:

```go
// Simplified, from runtime/chan.go
type hchan struct {
    qcount   uint          // elements in buffer
    dataqsiz uint          // buffer capacity (chan cap)
    buf      unsafe.Pointer // circular buffer
    elemsize uint16
    closed   uint32
    sendx    uint          // write index in circular buffer
    recvx    uint          // read index
    recvq    waitq         // queue of blocked receivers
    sendq    waitq         // queue of blocked senders
    lock     mutex
}
```

### sudog — a Parked Goroutine

When a goroutine blocks on a send or receive, the runtime creates a `sudog` struct that links the goroutine to the channel:

```go
type sudog struct {
    g    *g             // the waiting goroutine
    elem unsafe.Pointer // pointer to data (being sent or received into)
    next *sudog
    prev *sudog
    // ...
}
```

`recvq` and `sendq` are doubly-linked lists of `sudog` values.

### Send Algorithm

```
ch <- v:
1. lock(ch.lock)
2. If channel is closed → panic
3. If recvq is non-empty → send v directly to the waiting receiver (short-circuit), wake it up
4. If buf is not full → copy v into buf[sendx], sendx++, qcount++
5. Otherwise → create sudog, add to sendq, park the goroutine
6. unlock(ch.lock)
```

**Direct send** is an optimisation: if a receiver is already waiting, Go copies the value directly into its stack, bypassing the buffer. This is faster than writing to the buffer and then reading from it.

### Unbuffered vs Buffered Channel

```go
// Unbuffered: sender and receiver synchronise
ch := make(chan int)
go func() { ch <- 1 }() // blocks until a receiver is ready
v := <-ch                // unblocks the sender

// Buffered: up to cap elements without blocking
ch := make(chan int, 3)
ch <- 1  // does not block
ch <- 2  // does not block
ch <- 3  // does not block
ch <- 4  // blocks! buffer is full
```

### Closing a Channel

```go
close(ch):
1. lock
2. If already closed → panic
3. Set ch.closed = 1
4. Wake all receivers in recvq (they get the zero value)
5. Wake all senders in sendq (they will panic)
6. unlock
```

Rule: only the **sender** should close a channel. Closing is a signal: "no more data will be sent."

---

## Interface: iface and eface

### Two Interface Types

**eface** (empty interface) — `any` / `interface{}`:
```go
type eface struct {
    _type *_type         // pointer to type metadata
    data  unsafe.Pointer // pointer to data (or inlined data)
}
```

**iface** (non-empty interface) — an interface with methods:
```go
type iface struct {
    tab  *itab           // pointer to the method table
    data unsafe.Pointer  // pointer to data
}
```

### itab — Method Table

`itab` caches the relationship between a concrete type and an interface:

```go
type itab struct {
    inter *interfacetype // interface description
    _type *_type         // concrete type
    hash  uint32         // copy of _type.hash (for fast type switches)
    _     [4]byte
    fun   [1]uintptr     // method pointer table (variable length!)
}
```

`itab` is cached in a global hash table — repeated casts from the same type to the same interface do a table lookup, not a rebuild.

### Assignment to an Interface

```go
var w io.Writer
f := os.Stdout // *os.File

w = f
// w.tab  = itab{inter: io.Writer, type: *os.File, fun: [(*os.File).Write]}
// w.data = unsafe.Pointer(f)
```

**Interfaces are two words.** Copying an interface copies `tab` and `data` (both pointers), not the underlying data. Calling a method through an interface is indirect (via `tab.fun[i]`), which is slightly more expensive than a direct call.

### nil Interface vs nil Pointer Inside an Interface

A classic trap:

```go
func returnsError() error {
    var p *MyError = nil
    if false {
        return p // NEVER return this way!
    }
    return nil
}

err := returnsError()
fmt.Println(err == nil) // false! iface{tab: *MyError, data: nil} != nil interface
```

An interface is nil only if **both** fields (`tab` and `data`) are nil. An interface with a non-nil `tab` (a concrete type) and a nil `data` is a non-nil interface.

### Type Assertion and Type Switch

```go
// Type assertion — panics on wrong type
f := w.(*os.File)

// Safe form — no panic
f, ok := w.(*os.File)

// Type switch — efficient: uses hash from itab
switch v := i.(type) {
case *os.File:
    // v is *os.File
case *bufio.Writer:
    // v is *bufio.Writer
default:
    // v is the original interface type
}
```

The same `itab` hash lookup powers `errors.As`. Go 1.26 introduces `errors.AsType[T]` as a generic wrapper that eliminates the target variable:

```go
// Go <1.26: errors.As requires a typed target variable
var ve *ValidationError
if errors.As(err, &ve) {
    fmt.Println(ve.Field)
}

// Go 1.26: errors.AsType[T] — no target variable needed
if ve, ok := errors.AsType[*ValidationError](err); ok {
    fmt.Println(ve.Field)
}
```

---

## defer / panic / recover

### defer: the Deferred Call Stack

`defer` pushes a function call onto the goroutine's deferred call stack. Deferred calls execute in **LIFO** order when the enclosing function returns — either normally or via a panic.

Since Go 1.14 the compiler optimises "static" defers (known at compile time) using **open-coded defer** — they are inlined rather than represented as a `_defer` struct. This makes defer nearly free in most cases.

```go
type _defer struct {
    fn   func()     // the deferred function
    sp   uintptr    // SP of the calling function
    pc   uintptr    // return PC
    link *_defer    // next defer on the stack
}
```

```go
func example() {
    defer fmt.Println("third") // runs last
    defer fmt.Println("second")
    defer fmt.Println("first") // runs first (LIFO)
}
// Output: first, second, third
```

**defer + named return values:**

```go
func readFile(path string) (n int, err error) {
    f, err := os.Open(path)
    if err != nil {
        return
    }
    defer func() {
        if cerr := f.Close(); cerr != nil && err == nil {
            err = cerr // defer can modify the return value!
        }
    }()
    return io.Copy(io.Discard, f)
}
```

### panic: Stack Unwinding

`panic(v)` starts **stack unwinding**:
1. All defers in the current function execute (LIFO).
2. The goroutine unwinds the call stack, executing defers in each frame.
3. If the panic is not recovered — the program terminates with a goroutine stack dump.

A panic does NOT cross goroutine boundaries: if a goroutine panics without a recover, it kills the entire program.

```go
func riskyOperation() {
    defer func() {
        if r := recover(); r != nil {
            log.Printf("recovered: %v", r)
        }
    }()

    panic("something went wrong") // this panic is caught
}
```

### recover: Catching a Panic

`recover()` intercepts the current panic. It works **only inside a defer function**. It returns the value passed to `panic()`.

```go
// recover works:
defer func() {
    r := recover() // catches the panic
}()

// recover does NOT work (not in defer):
r := recover() // always nil outside a defer

// recover does NOT work (nested call):
defer func() {
    innerRecover() // if recover() is inside innerRecover — it won't catch!
}()
```

### panic/recover Rules for Interviews

1. `panic` + `recover` are NOT the standard error handling mechanism. Use them for truly exceptional situations.
2. Libraries should not let panics escape — catch panics at the package boundary and return errors.
3. `recover` in one goroutine does not catch a panic in another goroutine.
4. After `recover` the program continues, but state may be inconsistent — be careful.

```go
// Pattern: safely execute a user-supplied callback
func safeExecute(fn func() error) (err error) {
    defer func() {
        if r := recover(); r != nil {
            err = fmt.Errorf("panic: %v\n%s", r, debug.Stack())
        }
    }()
    return fn()
}
```

---

## Quick Reference: Sizes and Overhead

| Type | In-memory size | Copy cost |
|------|---------------|-----------|
| `map[K]V` | 8 bytes (pointer to hmap) | Cheap (pointer copy) |
| `[]T` | 24 bytes (ptr + len + cap) | Cheap (3 words) |
| `chan T` | 8 bytes (pointer to hchan) | Cheap (pointer copy) |
| `interface{}` | 16 bytes (tab + data) | Cheap (2 words) |
| Interface method call | — | +1 indirect (tab lookup) |
| Type assertion | — | Hash compare + check |

---

## Self-Check Questions

1. **Why is map iteration order undefined in Go?**
   A random seed `hash0` is generated at map creation time. Additionally, iteration intentionally starts from a random bucket — this prevents programs from accidentally relying on a particular order.

2. **What happens when append exceeds a slice's capacity?**
   A new, larger array is allocated, the data is copied, and a new header with a new `Data` pointer is returned. The old header continues to point to the old array.

3. **How does an unbuffered channel differ from a buffered one in terms of hchan?**
   An unbuffered channel has `dataqsiz == 0` and no buffer. Every send blocks until a receiver is ready (or the value is delivered via direct send short-circuit).

4. **Why is an interface holding a nil pointer not equal to nil?**
   An interface is a pair (tab, data). If tab is non-nil (there is a concrete type), the interface is non-nil, even when data is nil.

5. **In what order do defers execute? When does recover catch a panic?**
   Defers execute in LIFO order. `recover()` catches a panic only when called directly inside a defer function on the same goroutine that is panicking.
