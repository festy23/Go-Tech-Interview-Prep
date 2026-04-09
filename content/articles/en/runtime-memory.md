---
title: Memory Management in Go
blockId: runtime-memory
parentBlockId: runtime
---

## Introduction

Memory management is one of the topics that most reliably separates mid-level from senior candidates. Understanding how Go decides where to place an object, when to trigger the GC, and why pauses can spike under load is not academic trivia — it is operational knowledge that directly shapes the behaviour of real services.

This article covers three interconnected areas:
- **Escape analysis** — the compiler's static decision: stack or heap.
- **Memory allocator** — the three-level hierarchy mcache → mcentral → mheap.
- **Garbage collector** — tri-color concurrent mark-and-sweep, write barriers, GOGC and GOMEMLIMIT.

---

## Stack vs Heap

In Go every goroutine has its own stack. The stack starts at 8 KB (Go 1.25) and grows dynamically as needed. Variables whose lifetime is bounded by the current stack frame are allocated on the stack. This is fast because:
- allocation is a single pointer bump;
- the GC does not scan the stack;
- deallocation happens automatically when the function returns.

Variables that outlive their frame are allocated on the **heap** — a region managed by the allocator and GC. The heap is more expensive: a free block of the right size must be found, metadata must be updated, and the GC must eventually scan and reclaim the object.

The compiler makes this stack-or-heap decision at compile time through **escape analysis**.

---

## Escape Analysis

Escape analysis is a static pass that determines whether an object will outlive the function that created it. If not — it lives on the stack. If yes — it "escapes" to the heap.

```bash
go build -gcflags="-m" ./...
# More verbose:
go build -gcflags="-m -m" ./...
```

Sample output:
```
./main.go:10:6: moved to heap: result
./main.go:15:14: &s escapes to heap
./main.go:22:12: inlining call to fmt.Println
```

### When an Object Escapes to the Heap

**1. A pointer to a local variable is returned:**

```go
// result escapes to heap — caller holds the pointer after return
func newResult() *Result {
    result := Result{Value: 42}
    return &result // escape!
}

// Go 1.26: new(val) — pointer to a value expression, same escape behaviour
func newResult() *Result {
    return new(Result{Value: 42}) // equivalent: allocates on heap, returns pointer
}
```

**2. The variable is passed as an interface value:**

```go
var w io.Writer = os.Stdout
fmt.Fprintf(w, "%d", value) // value may escape depending on type
```

**3. The variable is captured by a goroutine closure:**

```go
x := 42
go func() {
    fmt.Println(x) // x escapes — the goroutine outlives x
}()
```

**4. Size is not known at compile time:**

```go
s := make([]byte, n) // if n is a variable, the slice escapes to heap
```

### Practical Advice

There is no need to fear escape — the compiler is smart and often optimises what looks like an obvious escape. Profile hot paths, do not optimise blindly.

```go
// Bad: []byte escapes to heap on every call in a hot path
func handler(w http.ResponseWriter, r *http.Request) {
    w.Write([]byte("OK")) // allocation
}

// Good: reuse a static variable
var okBody = []byte("OK")
func handler(w http.ResponseWriter, r *http.Request) {
    w.Write(okBody) // no allocation
}
```

---

## Allocator Hierarchy: mcache → mcentral → mheap

Go uses a **size-class allocator** — objects of different sizes are served by separate pools. There are roughly 70 size classes (from 8 bytes to 32 KB). Objects larger than 32 KB ("large objects") are allocated directly from mheap.

### mcache — Per-P Cache

Every P has its own mcache — a set of pre-allocated spans for each size class. Allocation from mcache happens **without locks**: P owns its mcache exclusively.

```
P0.mcache: [span_8, span_16, span_24, ..., span_32768]
P1.mcache: [span_8, span_16, span_24, ..., span_32768]
```

When a span in mcache is exhausted, P requests a new span from mcentral.

### mcentral — Global Span Pool

mcentral maintains two lists of spans for each size class:
- `partial` — spans with free slots;
- `full` — completely occupied spans.

Access to mcentral is protected by a per-size-class mutex (not a single global mutex).

### mheap — OS Heap Memory

mheap is the lowest level. It manages pages of memory requested from the OS via `mmap`. The data structure is a treap (tree + heap) for fast lookup of free page ranges.

When mcentral needs a new span, mheap allocates the required pages. When mheap runs out, it requests more memory from the OS via `mmap`.

```
Small object allocation (≤32 KB):
  mcache[sizeclass] → mcentral[sizeclass] → mheap → mmap(OS)

Large object allocation (>32 KB):
  mheap → mmap(OS)
```

---

## Garbage Collector: Tri-Color Mark-and-Sweep

Go's GC is concurrent, tri-color, and mark-and-sweep. The goal is to minimise Stop-The-World pause time by doing the bulk of the work concurrently with the application.

### The Three Colors

- **White** — not yet visited. At the end of marking, all white objects are garbage.
- **Grey** — reachable, but children not yet scanned.
- **Black** — fully scanned; will not be collected.

**Invariant**: a black object never points directly to a white object. This is enforced by the write barrier.

### GC Phases

**1. Mark Setup (STW, ~0.1–0.5 ms)**
Short Stop-The-World pause:
- write barriers are enabled;
- root objects are scanned (global variables, goroutine registers).

**2. Mark (concurrent)**
Marker goroutines traverse the object graph: grey → black, their children → grey. The application runs in parallel. Write barriers intercept pointer mutations to maintain the invariant.

```
Start: all objects white
Root scan: root objects → grey
Mark loop: grey → black, their children → grey
End: only black (live) and white (garbage)
```

**3. Mark Termination (STW, ~0.1–0.5 ms)**
- drain remaining grey objects;
- disable write barriers.

**4. Sweep (concurrent)**
White objects are garbage. Sweep goroutines asynchronously return their spans to mcentral/mcache. The application is already running — no pause.

### Write Barrier

The write barrier is an instruction inserted by the compiler before every heap pointer write during the concurrent mark phase. It ensures that if a black object begins pointing to a white object (violating the invariant), the white object is shaded grey.

```go
// Pseudo-code of write barrier (Dijkstra-style, simplified):
func writePointer(slot *unsafe.Pointer, ptr unsafe.Pointer) {
    shade(*slot) // shade the old value grey
    shade(ptr)   // shade the new value grey
    *slot = ptr  // the actual write
}
```

The write barrier is active only during the Mark phase — at all other times it is a no-op.

---

## GOGC and GOMEMLIMIT

### GOGC

`GOGC` controls the **frequency** of GC triggers via the ratio of new allocations to live heap.

```
trigger_heap = live_heap * (1 + GOGC/100)
```

With `GOGC=100` (the default): if the live heap is 100 MB, the next GC triggers when the heap grows to 200 MB.

- `GOGC=200` — less frequent GC, higher memory use, less CPU spent on GC.
- `GOGC=50` — more frequent GC, lower memory use, more CPU on GC.
- `GOGC=off` — disables GC entirely (use with caution).

```go
import "runtime/debug"

// Raise GOGC for allocation-heavy batch jobs
debug.SetGCPercent(200)
```

### GOMEMLIMIT (Go 1.19+)

`GOMEMLIMIT` sets a **hard upper bound** on memory consumption. The runtime will trigger GC as aggressively as needed to stay below the limit.

```bash
GOMEMLIMIT=512MiB go run server.go
```

```go
import "runtime/debug"

// Set the limit dynamically
debug.SetMemoryLimit(512 * 1024 * 1024) // 512 MB
```

**Why this matters in containers:**
Without `GOMEMLIMIT`, the runtime can exceed the cgroup memory limit and be killed by the kernel OOM reaper. With `GOMEMLIMIT`, Go is aware of the ceiling and will not exceed it.

**Recommended container configuration:**
```bash
# 90% of the cgroup limit — leave headroom for unmanaged memory (CGo, OS buffers)
GOMEMLIMIT=460MiB  # if cgroup limit = 512 MiB
GOGC=100
```

### GOGC and GOMEMLIMIT Interaction

| GOGC | GOMEMLIMIT | Behaviour |
|------|-----------|-----------|
| 100 | unset | Standard: GC when heap grows by 100% |
| off | 512MiB | GC only when approaching 512 MiB |
| 100 | 512MiB | GC when heap grows OR when approaching 512 MiB — whichever comes first |

---

## Diagnostics: Memory Profiling

### go tool pprof

```go
import (
    "net/http"
    _ "net/http/pprof"
)

func main() {
    go http.ListenAndServe("localhost:6060", nil)
    // ... your code
}
```

```bash
# Heap profile (live objects)
go tool pprof http://localhost:6060/debug/pprof/heap

# Allocation profile (cumulative since start)
go tool pprof http://localhost:6060/debug/pprof/allocs

# Inside pprof:
# top        — top functions by allocation
# list func  — line-by-line breakdown
# web        — call graph in browser
```

### runtime.ReadMemStats

```go
package main

import (
    "fmt"
    "runtime"
)

func printMemStats() {
    var m runtime.MemStats
    runtime.ReadMemStats(&m)
    fmt.Printf("Alloc:        %v KB\n", m.Alloc/1024)
    fmt.Printf("TotalAlloc:   %v KB\n", m.TotalAlloc/1024)
    fmt.Printf("Sys:          %v KB\n", m.Sys/1024)
    fmt.Printf("NumGC:        %v\n", m.NumGC)
    fmt.Printf("PauseTotalNs: %v ms\n", m.PauseTotalNs/1e6)
}
```

### GODEBUG=gctrace and Friends

```bash
# Compact GC log line per cycle
GODEBUG=gctrace=1 go run main.go

# GC pacer trace (advanced)
GODEBUG=gcpacertrace=1 go run main.go
```

Sample `gctrace=1` output:
```
gc 1 @0.012s 2%: 0.11+0.89+0.006 ms clock, 0.88+0.22/0.72/0+0.054 ms cpu, 4->4->2 MB, 5 MB goal, 0 MB stacks, 0 MB globals, 8 P
```

- `4->4->2 MB` — heap before GC → after marking → after sweep.
- `5 MB goal` — target heap size per GOGC.
- `8 P` — number of processors.

---

## Practical Patterns

### sync.Pool — Reusing Objects

`sync.Pool` lets you reuse objects across calls, reducing GC pressure:

```go
var bufPool = sync.Pool{
    New: func() any {
        return make([]byte, 0, 4096)
    },
}

func handler(w http.ResponseWriter, r *http.Request) {
    buf := bufPool.Get().([]byte)
    buf = buf[:0] // reset length, keep capacity
    defer bufPool.Put(buf)

    buf = appendResponse(buf, r)
    w.Write(buf)
}
```

Important: `sync.Pool` does **not** guarantee retention across GC cycles. Never store state there — only reusable buffers.

### Avoid Allocations in Hot Paths

```go
// Bad: string → []byte conversion allocates every time
func writeString(w io.Writer, s string) {
    w.Write([]byte(s)) // allocation
}

// Good: io.WriteString avoids allocation when w implements io.StringWriter
func writeString(w io.Writer, s string) {
    io.WriteString(w, s) // no allocation for strings.Builder, bufio.Writer, etc.
}
```

### Pre-Allocate Slices

```go
// Bad: repeated realloc on append
result := []Item{}
for _, id := range ids {
    result = append(result, fetchItem(id))
}

// Good: single allocation
result := make([]Item, 0, len(ids))
for _, id := range ids {
    result = append(result, fetchItem(id))
}
```

---

## Self-Check Questions

1. **What is escape analysis? Name three reasons an object escapes to the heap.**
   Escape analysis is a compiler pass that determines whether a variable needs heap allocation. Three reasons: returning a pointer to a local variable, passing to an interface, capture by a goroutine closure.

2. **How does mcache differ from mcentral?**
   mcache is a per-P lock-free cache (P owns it). mcentral is a global pool of spans with a per-size-class mutex.

3. **What is a write barrier and why is it needed?**
   A write barrier is a compiler-inserted instruction that intercepts heap pointer writes during the concurrent mark phase. It maintains the invariant that a black object never points directly to a white one.

4. **How does GOMEMLIMIT protect a Go service from OOM kill in a container?**
   GOMEMLIMIT sets a hard memory ceiling. The runtime will trigger GC as aggressively as needed to stay under the limit, preventing the kernel OOM reaper from killing the process.

5. **How do you verify an object is not heap-allocated in a hot path?**
   `go build -gcflags="-m"` shows what escapes. In tests, `testing.AllocsPerRun(N, fn)` measures the average number of allocations per call:

```go
func BenchmarkHandler(b *testing.B) {
    allocs := testing.AllocsPerRun(100, func() {
        handler(rw, req)
    })
    if allocs > 0 {
        b.Errorf("expected 0 allocs, got %v", allocs)
    }
}
```
