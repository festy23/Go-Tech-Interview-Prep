---
title: Scalability
blockId: sysdesign-scalability
parentBlockId: sysdesign
---

# Scalability

Scalability is a system's ability to handle increasing load by adding resources. It is one of the first topics on every system design interview because almost every architectural decision has scalability implications — where you store state, how you route requests, how you partition data.

## Vertical vs Horizontal Scaling

### Vertical Scaling (Scale Up)

Add more CPU, RAM, or faster disks to an existing machine. A database that handles 500 req/s on a 4-core server might handle 2000 req/s on a 16-core server without any code changes.

**Advantages:**
- Simple — no changes to application code or deployment topology.
- No distributed-systems complexity (no sharding, no network partitions).
- Consistent strong-consistency guarantees (single machine, single database).

**Disadvantages:**
- Hard limit: hardware has a ceiling. The largest AWS instance (u-24tb1.metal) has 224 vCPUs and 24 TB RAM — impressive, but finite.
- Single point of failure — the whole system goes down when the machine does.
- Cost per unit of performance increases non-linearly at the high end.

### Horizontal Scaling (Scale Out)

Add more machines and distribute load among them. Your web tier grows from 2 to 20 servers; your database tier uses replication and sharding.

**Advantages:**
- No hard ceiling — add machines indefinitely.
- Fault tolerance: losing one of twenty machines is recoverable.
- Cost efficiency: many commodity machines are cheaper than one enormous machine.

**Disadvantages:**
- State must be externalised or replicated: a request hitting server A must have access to the session or data that a previous request wrote on server B.
- Distributed-systems complexity: network partitions, replication lag, split-brain.
- Operational overhead: more machines to monitor, patch, and coordinate.

### The Stateless Service Principle

The key to horizontal scaling is **stateless services**. A stateless service holds no per-request or per-session state in memory between requests. Every request carries all the information needed to handle it, or that information is stored in a shared external store (database, Redis, S3).

```go
// Stateful — cannot scale horizontally without sticky sessions
type Handler struct {
    sessions map[string]*Session // in-memory, local to this instance
}

// Stateless — any instance can handle any request
type Handler struct {
    sessionStore SessionStore // Redis, PostgreSQL, etc.
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    token := r.Header.Get("Authorization")
    session, err := h.sessionStore.Get(r.Context(), token)
    // ...
}
```

In Go, externalising state is natural: use `database/sql` for PostgreSQL, `go-redis/redis` for Redis, or `aws/aws-sdk-go-v2/service/s3` for S3. The HTTP handler itself becomes a pure function of its inputs plus the external store.

## Load Balancing

A load balancer distributes incoming requests across a pool of backend servers. It decouples the public endpoint from the set of backend instances, enabling both horizontal scaling and zero-downtime deployments.

### Round-Robin

The simplest strategy: requests are distributed in a circular sequence — server 1, server 2, server 3, server 1, …

```
Request 1 → Server A
Request 2 → Server B
Request 3 → Server C
Request 4 → Server A  ← wraps around
```

**Suitable when:** all backend servers have equal capacity and request cost is uniform.
**Problem:** does not account for server load — a slow server accumulates requests faster than it processes them.

**Weighted round-robin** assigns a weight to each server proportional to its capacity.

### Consistent Hashing

Consistent hashing is a technique for distributing requests (or data) across a variable set of nodes such that adding or removing a node minimises redistribution.

**The Algorithm:**
1. Map each node to one or more points on a virtual ring (hash of node ID).
2. Map each incoming key (request, data shard) to a point on the same ring.
3. Assign the key to the first node clockwise from its ring position.

```
         Node A (hash: 10)
        /
Ring: 0 ────── 10 ──── 40 ──── 70 ──── 100
                        \       \
                      Node B   Node C
                      (40)     (70)

Key hash = 55 → routed to Node C (next clockwise node at 70)
```

**Why it matters:** when a node is added or removed, only the keys in the adjacent arc are redistributed — on average `1/N` of total keys, not `N-1/N` as with naive modulo hashing.

**Virtual nodes (vnodes):** to improve distribution uniformity, each physical node is represented by multiple points on the ring. This also helps when nodes have different capacities.

Consistent hashing is used in: Cassandra (data partitioning), Nginx (upstream selection), CDN edge caches, Memcached client libraries.

### Other Strategies

| Strategy | Description | Use Case |
|---|---|---|
| Least connections | Route to server with fewest active connections | Long-lived connections (WebSocket, gRPC streaming) |
| IP hash | Hash source IP to a server | Sticky sessions when server-side state cannot be avoided |
| Random | Pick a random server | Works well with many homogeneous servers |
| Resource-based | Route based on CPU/memory metrics | Heterogeneous clusters |

## Sharding

Sharding is the horizontal partitioning of a database: instead of one large table on one server, you split rows across multiple databases (shards) based on a shard key.

### Sharding Strategies

**Range-based sharding:** divide the key space into contiguous ranges.
- Shard 1: user IDs 1–1 000 000
- Shard 2: user IDs 1 000 001–2 000 000
- Shard 3: user IDs 2 000 001–3 000 000

*Advantage:* range queries are efficient — all data for IDs 500k–600k lives on shard 1.
*Disadvantage:* hot spots — if your newest users are the most active, shard 3 gets all the writes.

**Hash-based sharding:** apply a hash function to the shard key and map the result to a shard.

```go
func shardIndex(userID int64, numShards int) int {
    return int(userID % int64(numShards))
}
```

*Advantage:* uniform distribution — no hot spots.
*Disadvantage:* range queries are expensive (scatter-gather across all shards); resharding when adding nodes moves ~`(N-1)/N` of data.

**Directory-based sharding:** maintain a lookup table mapping keys to shards.
*Advantage:* maximum flexibility — any key can be moved to any shard.
*Disadvantage:* the lookup table is a bottleneck and a single point of failure.

### Cross-Shard Complexity

Sharding introduces constraints that are easy to underestimate:
- **Joins** across shards require application-level scatter-gather.
- **Transactions** that span multiple shards need distributed protocols (2PC, Saga).
- **Global aggregations** (COUNT(*), SUM) require merging partial results.
- **Rebalancing** when adding shards is operationally expensive.

These are the reasons many systems start with a single large PostgreSQL instance (with read replicas) and only shard when that is no longer sufficient.

## CAP Theorem

The CAP theorem (Brewer, 2000) states that a distributed system can guarantee at most **two** of the following three properties simultaneously:

- **C — Consistency:** every read receives the most recent write or an error.
- **A — Availability:** every request receives a (non-error) response — but without the guarantee of recency.
- **P — Partition Tolerance:** the system continues to operate when network messages are lost between nodes.

In practice, network partitions are unavoidable in any multi-node system (cables fail, switches drop packets). Therefore **P is not optional** — you must tolerate partitions. The real choice is between **C and A** during a partition event:

- **CP systems** (e.g., HBase, Zookeeper, etcd): under partition, refuse to serve stale data — they return errors or become unavailable. Correct answer, even if unavailable.
- **AP systems** (e.g., Cassandra, DynamoDB, CouchDB): under partition, serve potentially stale data rather than returning errors. Available, but possibly inconsistent.

Traditional relational databases (PostgreSQL, MySQL) are typically **CP** when configured with synchronous replication; they prioritise consistency over availability.

**Important nuance:** the CAP theorem is a binary, worst-case model. In practice, the PACELC model is more useful: it extends CAP to describe the **latency vs consistency trade-off** in the normal (non-partition) case, because even without a partition, you choose between replicating synchronously (lower availability/higher latency) or asynchronously (higher availability/lower latency but potential for stale reads).

## Eventual Consistency

Eventual consistency is a liveness property: if no new updates are made to a given data item, eventually all replicas will return the same value.

This is the consistency model of most AP systems. It is weaker than *strong consistency* (every read sees the latest write) but stronger than *no consistency* (arbitrary divergence).

**Patterns for working with eventual consistency:**

**Read-your-writes consistency:** after a client writes a value, subsequent reads by *the same client* always reflect that write. Implemented by routing reads from a client to the same replica that accepted its write (or by stamping writes with a token that the replica checks before serving reads).

**Monotonic reads:** once a client has seen a value at version N, it never sees a value at version < N. Prevents the jarring experience of reading a newer record and then seeing an older one on refresh.

**Conflict resolution:** when two replicas accept concurrent writes to the same key, they eventually diverge. Strategies include:
- *Last-write-wins (LWW):* accept the write with the higher timestamp. Simple but loses data.
- *Vector clocks:* track causality — if write B happens-after write A, B wins; if they are concurrent, surface a conflict for application-level resolution.
- *CRDTs (Conflict-free Replicated Data Types):* data structures with merge functions that are commutative, associative, and idempotent — they always converge to the same value regardless of merge order. Used in Riak, Redis CRDT, and collaborative editing tools.

## Putting It Together: Designing a Scalable Go Service

A typical Go microservice with horizontal scalability:

```go
func main() {
    // 1. Stateless handler — reads from external store, no in-process state
    db, _ := sqlx.Open("pgx", os.Getenv("DATABASE_URL"))
    rdb := redis.NewClient(&redis.Options{Addr: os.Getenv("REDIS_ADDR")})

    handler := &UserHandler{db: db, cache: rdb}

    // 2. Health check endpoint for load balancer probes
    mux := http.NewServeMux()
    mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
        w.WriteHeader(http.StatusOK)
    })
    mux.Handle("/users/", handler)

    srv := &http.Server{
        Addr:         ":8080",
        Handler:      mux,
        ReadTimeout:  5 * time.Second,
        WriteTimeout: 10 * time.Second,
        IdleTimeout:  120 * time.Second,
    }

    // 3. Graceful shutdown — finish in-flight requests before exiting
    done := make(chan struct{})
    go func() {
        quit := make(chan os.Signal, 1)
        signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
        <-quit

        ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
        defer cancel()
        srv.Shutdown(ctx)
        close(done)
    }()

    srv.ListenAndServe()
    <-done
}
```

This service can be deployed behind any L7 load balancer (Nginx, AWS ALB, Cloudflare). Because it is stateless, the load balancer can route any request to any instance, and you can add or remove instances without coordination.

## Self-Check Questions

1. **Your stateful web application stores sessions in local memory. Describe two strategies for making it horizontally scalable without changing the application code.**
   *Sticky sessions at the load balancer, or migrate session storage to Redis.*

2. **A hash-based sharding scheme splits users across 8 shards. You need to add a 9th. What percentage of keys must be moved with naive modulo sharding vs consistent hashing?**
   *Modulo: ~88.9% (8/9 keys change shard). Consistent hashing: ~11.1% (1/9 keys, only those in the new node's arc).*

3. **Under the CAP theorem, can you have a system that is both consistent and available during a network partition?**
   *No. During a partition you must choose: respond with potentially stale data (AP) or refuse to respond until partition heals (CP).*

4. **A user POSTs a new tweet. One second later they refresh their timeline and do not see it. What consistency property is violated and how would you fix it?**
   *Read-your-writes consistency is violated. Fix: route the user's subsequent reads to the primary replica, or use a replication token that tells replicas to wait until they have caught up to the write.*
