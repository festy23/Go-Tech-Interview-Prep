---
title: Go Scheduler
blockId: runtime-scheduler
parentBlockId: runtime
---

## Introduction

The scheduler is the heart of the Go runtime. It is responsible for keeping hundreds of thousands of goroutines alive concurrently without requiring hundreds of thousands of OS threads. At its core sits the cooperative-preemptive **GMP** model (Goroutine / Machine / Processor) — an M:N multiplexing scheme designed by the Go team from the language's earliest versions and progressively refined ever since.

Common interview questions on the scheduler:
- "Explain the GMP model" — often the first question after goroutines.
- "What happens to P when M blocks in a system call?"
- "How do you set GOMAXPROCS correctly in Kubernetes?"
- "How does work stealing work?"

---

## The GMP Model in Depth

### G — Goroutine

A goroutine is described by the `runtime.g` struct (package `runtime`, file `runtime/runtime2.go`). Key fields:

| Field | Description |
|-------|-------------|
| `stack` | Current stack range `[lo, hi)` |
| `sched` | Saved CPU context (PC, SP, …) |
| `atomicstatus` | Atomic status: `_Gidle`, `_Grunnable`, `_Grunning`, `_Gwaiting`, … |
| `m` | Pointer to the M currently running this goroutine |
| `goid` | Unique goroutine identifier |

The initial stack size is 2–8 KB (Go 1.25 uses 8 KB). The stack grows dynamically: when space runs out, the runtime allocates a larger stack, copies the contents, and updates all pointers. The maximum is 1 GB (configurable with `runtime/debug.SetMaxStack`).

### M — Machine (OS Thread)

`M` is a real OS thread. One M is always bound to one P (or none, if blocked). Several important invariants:

- The number of Ms is unbounded; the runtime creates a new M whenever all existing Ms are busy or blocked.
- `GOMAXPROCS` limits the number of **concurrently running** Ms, not the total.
- An M that blocks in a system call (e.g., `read(2)`) detaches from its P. When the syscall returns, M tries to acquire a free P; if none is available, the goroutine is placed in the global run queue and M parks itself in the thread cache.

### P — Processor

P is a **scheduling resource**, not a physical processor. It:
- holds the **Local Run Queue** (LRQ) — a ring buffer of up to 256 goroutines;
- caches mcache objects (memory allocator);
- picks the next goroutine from its LRQ when the current one yields, or steals from another P.

The number of Ps is controlled by `GOMAXPROCS`. Default: `runtime.NumCPU()`.

```go
package main

import (
    "fmt"
    "runtime"
)

func main() {
    // Current GOMAXPROCS value (0 = read only, do not change)
    p := runtime.GOMAXPROCS(0)
    fmt.Println("P:", p)

    // Change GOMAXPROCS at runtime (rarely needed manually)
    runtime.GOMAXPROCS(2)
    fmt.Println("P after change:", runtime.GOMAXPROCS(0))
}
```

**When to change GOMAXPROCS:**
- In containers where the CPU quota is less than the host core count — use `uber-go/automaxprocs`.
- For latency-sensitive services, GOMAXPROCS < NumCPU can sometimes reduce L3 cache contention.
- For CPU-intensive work (video encoding, cryptography) — GOMAXPROCS = NumCPU, or slightly less to leave headroom for the OS.

---

## Work Stealing

When a P exhausts its LRQ it does not idle — it searches for work:

1. Checks the **GRQ** (Global Run Queue) — takes `min(len(GRQ)/GOMAXPROCS + 1, 256/2)` goroutines.
2. Checks **netpoll** — takes goroutines whose I/O is ready.
3. **Steals from a random P** — takes exactly half of its LRQ.
4. If nothing is found anywhere — M enters spinning mode (short busy-wait), then sleeps.

```
P0 (empty)               P1
     │                LRQ: G0 G1 G2 G3
     └── steal 50% ──> P1 yields G2, G3
```

Work stealing guarantees even load distribution without a centralised dispatcher. This is especially visible in worker pools: if one P is overloaded, others automatically pick up the work.

**Global queue vs local queue:**
- LRQ is lock-free (P owns it exclusively).
- GRQ is protected by a mutex — accessing it is more expensive.
- Every **~61 ticks** the scheduler explicitly checks the GRQ (to prevent starvation of goroutines that landed there from syscalls).

---

## Sysmon: the Background Monitor

`sysmon` is a dedicated OS thread (with no P!) running in its own M. It does not need a P because it never runs goroutines — it only monitors the runtime.

What sysmon does every 10–20 ms:
1. **Polls netpoll** — moves I/O-ready goroutines from waiting to runnable.
2. **Retakes P from syscall Ms** — if an M has been stuck in a syscall for more than 20 µs, detaches P from M.
3. **Preempts long-running goroutines** — if a goroutine has been running for more than 10 ms, sends `SIGURG` to its M (async preemption, Go 1.14+).
4. **Forces GC** — if more than 2 minutes have passed since the last GC, triggers a new cycle.
5. **Fires timers** — wakes goroutines whose timers have expired.

```
sysmon loop:
  every ~10ms:
    - poll netpoll(0) → enqueue ready Gs
    - retake P from blocked syscall Ms
    - preempt long-running Gs (SIGURG)
    - scavenge idle spans (return memory to OS)
```

Sysmon cannot be disabled — it is an integral part of the scheduler.

---

## Netpoll: Non-Blocking I/O

Netpoll is an abstraction over platform-specific async I/O mechanisms:
- **Linux**: `epoll_wait`
- **macOS/BSD**: `kqueue`
- **Windows**: IOCP

When a goroutine calls `net.Conn.Read()` and no data is available:
1. The syscall returns `EAGAIN`.
2. The goroutine **parks** — transitions to `_Gwaiting`, its file descriptor is registered with epoll.
3. M is freed and picks up the next goroutine from the LRQ.
4. When data arrives, sysmon (or P during scheduling) polls netpoll and moves the goroutine to `_Grunnable`.

This allows tens of thousands of TCP connections to be served by a single OS thread — no callbacks, no async/await, just straight synchronous-looking code.

```go
package main

import (
    "fmt"
    "net/http"
    "sync"
)

func main() {
    var wg sync.WaitGroup
    results := make([]int, 100)

    // 100 concurrent HTTP requests: each goroutine parks on I/O
    // without holding an OS thread.
    for i := range 100 {
        wg.Add(1)
        go func() {
            defer wg.Done()
            resp, err := http.Get("https://go.dev")
            if err == nil {
                results[i] = resp.StatusCode
                resp.Body.Close()
            }
        }()
    }
    wg.Wait()
    fmt.Println("done, first status:", results[0])
}
```

---

## System Call Handling

System calls are a special case for the scheduler because most are **blocking**: while `read(2)` is in flight, the OS thread is frozen.

The runtime distinguishes two syscall types:

**1. "Fast" syscalls via `entersyscall` / `exitsyscall`**
For short calls (< 20 µs) M stays bound to P. If sysmon detects the syscall is running long, it retakes P — detaches P from M and hands it to another M.

**2. CGo and blocking calls via `entersyscallblock`**
If it is known upfront that the call will be long, the runtime releases P before the call. M blocks, P is picked up by another M.

```
M0 (blocked in read)          M1 (new or from park)
        │                              │
    (no P)                         P0 (acquired)
                                   LRQ: G, G, G
```

When the syscall completes, M0 tries to acquire a P. If all Ps are busy, the goroutine goes into the GRQ and M0 parks.

---

## Cooperation Points and Preemption

### Cooperative Points (Go < 1.14)

In early versions the scheduler was **purely cooperative**: a goroutine yielded the processor only at known points:
- any function call (the function prologue checked the `preempt` flag);
- channel operation (`ch <- v`, `<-ch`);
- `runtime.Gosched()` — explicit yield;
- `time.Sleep`;
- system call;
- heap allocation.

Problem: a tight loop with no function calls could freeze the entire P.

### Async Preemption (Go 1.14+)

Go 1.14 introduced **asynchronous preemption** via `SIGURG`:
1. Sysmon notices a goroutine has been running for more than 10 ms.
2. Sends `SIGURG` to M.
3. The signal handler injects an `asyncPreempt` stub frame into the goroutine's stack.
4. The goroutine is interrupted, its context is saved, and it is returned to the LRQ.

```go
// This tight loop will NOT freeze P in Go 1.14+:
func tightLoop(n int) int {
    sum := 0
    for i := range n {
        sum += i * i // no function calls, no cooperation points
    }
    return sum
}
```

| Mechanism | Versions | Description |
|-----------|----------|-------------|
| Function call preemption | all | Prologue checks the preempt flag |
| Async preemption (SIGURG) | ≥1.14 | Preempts any goroutine |
| Syscall preemption | all | M detaches from P automatically |
| `runtime.Gosched()` | all | Explicit CPU yield |

---

## Scheduler Tracing: GODEBUG=schedtrace

`GODEBUG=schedtrace=N` prints scheduler statistics every N milliseconds:

```bash
GODEBUG=schedtrace=1000 go run main.go
```

Sample output:
```
SCHED 1000ms: gomaxprocs=8 idleprocs=6 threads=10 spinningthreads=0 idlethreads=3 runqueue=0 [0 0 0 1 0 0 0 0]
```

Field breakdown:
- `gomaxprocs=8` — number of Ps.
- `idleprocs=6` — Ps with no work.
- `threads=10` — total OS threads.
- `spinningthreads=0` — Ms in active spin-wait.
- `runqueue=0` — goroutines in the GRQ.
- `[0 0 0 1 0 0 0 0]` — LRQ sizes for each P.

For detailed tracing use `go tool trace`:

```go
import "runtime/trace"

func main() {
    f, _ := os.Create("trace.out")
    trace.Start(f)
    defer trace.Stop()
    // ... your code
}

// Analysis:
// go tool trace trace.out
```

`go tool trace` renders a visual timeline of goroutines, Ps, and Ms — indispensable for debugging latency spikes and goroutine starvation.

---

## Common Pitfalls and Tips

### GOMAXPROCS in Containers

```go
// Automatically sets GOMAXPROCS from cgroup CPU quota
import _ "go.uber.org/automaxprocs"
```

Without this, Go may think it has 64 cores when the container has 2 vCPUs. The result: excessive contention and performance degradation.

### When to Use runtime.Gosched()

`runtime.Gosched()` explicitly yields the current P's CPU to other goroutines. It is rarely needed — mainly in tight loops that should be "polite":

```go
for {
    if hasWork() {
        doWork()
    } else {
        runtime.Gosched() // let other goroutines run
    }
}
```

### runtime.LockOSThread() — Pinning to a Thread

Some C libraries (GUI toolkits, OpenGL) require all calls to come from the same OS thread. `runtime.LockOSThread()` guarantees this:

```go
func runGUI() {
    runtime.LockOSThread()
    defer runtime.UnlockOSThread()
    // All GUI code here runs strictly on one M
    gui.Init()
    gui.MainLoop()
}
```

---

## Self-Check Questions

1. **What is P in the GMP model? How does it differ from M?**
   P is a scheduling resource (local run queue + mcache). M is an OS thread. P connects G to M; without a P, M cannot run goroutines.

2. **What happens to P when M enters a long system call?**
   Sysmon detects that M has been stuck in a syscall for more than 20 µs and retakes P: detaches it from M and hands it to another M (or creates a new one).

3. **How does work stealing balance load?**
   When a P's LRQ is empty, it steals half of another P's LRQ. This guarantees no P idles while neighbours have work to do.

4. **Why is async preemption (Go 1.14+) better than cooperative preemption?**
   Cooperative preemption fails in tight loops with no function calls. Async preemption via SIGURG forcibly interrupts any goroutine after ~10 ms regardless of what it is doing.

5. **How do you diagnose goroutine starvation on a specific P?**
   `GODEBUG=schedtrace=100` will show the LRQ size for each P. A non-zero value on one P with zeros on others is a sign of unbalanced load. `go tool trace` gives a visual timeline.
