---
title: Go Runtime and Scheduler
blockId: runtime
parentBlockId: null
---

# Go Runtime and Scheduler

The Go runtime is the invisible foundation beneath every Go program. It manages goroutines, garbage collection, memory allocation, network I/O, and system calls. Understanding the runtime means understanding why Go programs behave the way they do under load: where the low latency comes from, how hundreds of thousands of goroutines stay affordable, and why the GC is nearly invisible in production.

At the senior/staff interview level, runtime topics come up regularly. Interviewers want to know whether you can explain your program's behaviour under pressure, whether you'll configure GOMAXPROCS correctly inside a container, and whether you understand the difference between stack and heap allocation.

## What the Go Runtime Is

Unlike Java or Python, Go does not use a virtual machine. The Go runtime is compiled directly into your binary alongside your application code — every Go executable carries the runtime inside itself. This means no external runtime dependency at deploy time, predictable cold starts, and full control over program behaviour.

The runtime is responsible for several key areas:

- **Goroutine scheduling** — the GMP model (Goroutine / Machine / Processor) multiplexes thousands of goroutines onto a small number of OS threads.
- **Memory management** — a tri-color, concurrent mark-and-sweep garbage collector with write barriers.
- **Memory allocator** — a three-level hierarchy (mcache → mcentral → mheap) that minimises locking during allocation.
- **Escape analysis** — the compiler decides at build time whether to place an object on the stack or the heap.
- **Netpoll** — an abstraction over epoll/kqueue/IOCP that enables non-blocking I/O without dedicated OS threads.
- **Sysmon** — a background monitor that detects stuck goroutines, handles network timeouts, and forces GC cycles when needed.

## Scheduler: the GMP Model

The scheduler is the heart of the runtime. It implements the **GMP** model.

**G (Goroutine)** — the `runtime.g` struct, holding the goroutine's stack, program counter, and status. The initial stack is 2–8 KB and grows dynamically up to 1 GB.

**M (Machine)** — an actual OS thread. M runs goroutines. When a blocking system call is made, M detaches from P and the runtime creates a new M so work continues uninterrupted.

**P (Processor)** — a scheduling resource that holds a local run queue (LRQ, up to 256 goroutines) and connects G to M. The number of Ps is controlled by `GOMAXPROCS`.

```
  P0             P1
  LRQ: G,G,G     LRQ: G,G
     │               │
     M0              M1
     │               │
  OS Thread       OS Thread
```

When a P's local queue is empty, the scheduler uses **work stealing** — it takes half of another P's LRQ. This balances load across cores without manual intervention.

```go
import "runtime"

func main() {
    fmt.Println("GOMAXPROCS:", runtime.GOMAXPROCS(0))
    fmt.Println("NumCPU:    ", runtime.NumCPU())
    fmt.Println("Goroutines:", runtime.NumGoroutine())
}
```

Since Go 1.14 the scheduler supports **asynchronous preemption** via the `SIGURG` signal: `sysmon` interrupts goroutines that have been running for more than ~10 ms, even when they contain no function calls.

## Garbage Collector: Three Phases

Go's GC is concurrent, tri-color, and mark-and-sweep. The goal is to minimise pause time while maintaining a consistent view of the object graph.

**Three colors:**
- **White** — not yet visited; candidate for collection.
- **Grey** — reachable, but children not yet scanned.
- **Black** — fully scanned; will not be collected.

**GC phases:**
1. **Mark setup (STW)** — short Stop-The-World pause to enable write barriers.
2. **Mark (concurrent)** — marker goroutines traverse the object graph alongside running application code.
3. **Mark termination (STW)** — finalize marking, disable write barriers.
4. **Sweep (concurrent)** — reclaim white objects without pausing.

The **write barrier** ensures that pointer mutations during the concurrent mark phase do not violate the algorithm's invariants.

Two key environment variables:

```bash
GOGC=100           # default: trigger GC when heap grows by 100%
GOMEMLIMIT=512MiB  # Go 1.19+: hard cap on memory consumption
```

`GOMEMLIMIT` is critical in containers — without it the runtime can exceed cgroup limits and be killed by the kernel OOM reaper.

## Escape Analysis and the Memory Allocator

**Escape analysis** is a static compiler pass that decides whether to allocate an object on the stack (cheap, invisible to GC) or the heap (more expensive, GC-managed).

```bash
go build -gcflags="-m" ./...
# Output: ./main.go:12:6: moved to heap: result
```

An object escapes to the heap when:
- a pointer to a local variable is returned from a function;
- the variable is passed as an interface value;
- the size exceeds the escape analysis threshold;
- the object is captured by a goroutine closure.

**Allocator hierarchy:**

| Level    | Description                               | Locking          |
|----------|-------------------------------------------|------------------|
| mcache   | Per-P cache of spans, ~100 size classes   | None             |
| mcentral | Global pool of spans for one size class   | Per-class mutex  |
| mheap    | OS pages, treap-based free-list           | Global mutex     |

Most small-object allocations are served from mcache without any locking — this is why Go programs scale well across cores.

## Netpoll: Non-Blocking I/O

Go wraps epoll (Linux) / kqueue (macOS) / IOCP (Windows) behind a single abstraction layer called **netpoll**. When a goroutine calls `net.Conn.Read()` and no data is available, it does not block an OS thread — it parks itself and waits. Sysmon periodically polls netpoll and returns ready goroutines to the run queues.

This architecture allows millions of TCP connections to be served by a handful of OS threads.

## Topics in This Block

This article is a high-level overview. Details are covered in three dedicated articles:

- **Scheduler** — GMP in depth, GOMAXPROCS, sysmon, netpoll, system call handling, `GODEBUG=schedtrace` tracing, cooperation points.
- **Memory** — tri-color GC, write barriers, GOGC, GOMEMLIMIT, escape analysis, stack vs heap, allocator hierarchy.
- **Internals** — internal layout of map, slice, channel, interface, and defer/panic/recover mechanics.

## Common Interview Questions

**"How many GOMAXPROCS should you set in a 2-vCPU container?"**
By default Go reads `runtime.NumCPU()`, which inside a container may return the host's total core count rather than the cgroup quota. Use `uber-go/automaxprocs` or set `GOMAXPROCS=2` explicitly.

**"What is the difference between GOGC and GOMEMLIMIT?"**
`GOGC` controls GC frequency via the ratio of new allocations to live heap. `GOMEMLIMIT` sets an absolute memory ceiling — the GC will run aggressively to stay below the limit, even if that conflicts with the `GOGC` target.

**"How do you verify an object does not escape to the heap?"**
Run `go build -gcflags="-m"` and inspect the output. Rewrite the code so the object is not passed as an interface or captured by a goroutine closure.

**"What is STW and how long do pauses last in modern Go?"**
Stop-The-World occurs twice per GC cycle (mark setup and mark termination). Since Go 1.17 the average pause is a fraction of a millisecond; typical production values are 0.1–1 ms.

## What's Next

Recommended learning order: **scheduler** → **memory** → **internals**. This gives you first an understanding of how goroutines live, then how their memory is managed, and finally how the key data structures you use every day are implemented.

After the theory, move to practice: enable `GODEBUG=schedtrace=1000`, run `go tool pprof`, and read `go tool trace` output — the runtime only reveals itself fully when you watch it in action on real programs.
