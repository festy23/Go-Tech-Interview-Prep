---
title: Caching
blockId: sysdesign-caching
parentBlockId: sysdesign
---

# Caching

Caching is the practice of storing the result of an expensive computation or I/O operation in faster storage so that subsequent requests can be served without repeating the work. It is the single highest-leverage performance optimisation in most distributed systems — a well-placed cache can reduce average read latency by two orders of magnitude and cut database load by 90% or more.

Understanding cache strategies, invalidation techniques, and failure modes is essential for both system design interviews and production engineering.

## Why Caching Matters

A typical stack without caching:
- Network round trip: ~1 ms (same datacenter)
- PostgreSQL index scan: ~5–50 ms
- PostgreSQL full table scan: ~50–5000 ms

With Redis in front:
- Redis GET: ~0.1–0.3 ms
- Cache hit rate 95%: average latency ≈ 0.95 × 0.2 ms + 0.05 × 20 ms = 1.19 ms

The caching tax is complexity: you now have two sources of truth that must be kept in sync.

## Cache Strategies

### Cache-Aside (Lazy Loading)

The application manages the cache explicitly. On a cache miss, the application reads from the database, writes to the cache, and returns the result.

```go
func (s *UserService) GetUser(ctx context.Context, id int64) (*User, error) {
    key := fmt.Sprintf("user:%d", id)

    // 1. Try cache first
    cached, err := s.redis.Get(ctx, key).Bytes()
    if err == nil {
        var u User
        if err := json.Unmarshal(cached, &u); err == nil {
            return &u, nil
        }
    }

    // 2. Cache miss — read from database
    user, err := s.db.GetUser(ctx, id)
    if err != nil {
        return nil, err
    }

    // 3. Populate cache for future reads
    data, _ := json.Marshal(user)
    s.redis.Set(ctx, key, data, 5*time.Minute)

    return user, nil
}
```

**Advantages:**
- Only requested data is cached — no wasted memory on unused records.
- Cache failures are non-fatal: the system falls back to the database transparently.
- The cache schema can differ from the database schema (projections, aggregations).

**Disadvantages:**
- First request after a cache miss (or cold start) is slow.
- Cache-database inconsistency window: if another process updates the database, the cache holds stale data until TTL expires.
- Three network calls on a cache miss: read cache → read DB → write cache.

Cache-aside is the most common pattern and the right default for read-heavy workloads.

### Write-Through

Every write to the database is also written to the cache synchronously. The cache is always up to date.

```go
func (s *UserService) UpdateUser(ctx context.Context, u *User) error {
    // 1. Write to database
    if err := s.db.UpdateUser(ctx, u); err != nil {
        return err
    }

    // 2. Synchronously update cache
    key := fmt.Sprintf("user:%d", u.ID)
    data, _ := json.Marshal(u)
    return s.redis.Set(ctx, key, data, 5*time.Minute).Err()
}
```

**Advantages:**
- Cache is always consistent with the database immediately after writes.
- Reads never see stale data.

**Disadvantages:**
- Write latency doubles: the caller waits for both the DB and the cache write.
- Cache is populated even for data that is never read — wasted writes.
- If the cache write fails after the DB write succeeds, you have an inconsistency. Handle with retry or accept a brief inconsistency window.

Write-through is appropriate when reads are frequent, writes are occasional, and read latency SLA is strict.

### Write-Behind (Write-Back)

The application writes to the cache first; the cache layer asynchronously flushes to the database. The write returns as soon as the cache acknowledges it.

**Advantages:**
- Write latency is minimal — just the cache round trip.
- Batches multiple writes to the same key — reduces database write amplification.

**Disadvantages:**
- **Durability risk:** if the cache node crashes before flushing, data is lost.
- Complex to implement correctly (acknowledgement, retry, ordering guarantees).
- Generally not suitable for financial or user data where durability is mandatory.

Write-behind is used in time-series ingest pipelines and analytics buffers where some data loss is acceptable.

### Read-Through

Similar to cache-aside, but the cache layer itself handles fetching from the database on a miss. The application always talks to the cache, never directly to the database.

This is the model of many managed CDN caches and some Redis modules. In application code it looks identical to cache-aside from the caller's perspective.

## Redis in Go

Redis is the dominant external cache for Go services. The standard Go client is `go-redis/redis`.

```go
import "github.com/redis/go-redis/v9"

opts := new(redis.Options) // Go 1.26: new(T) returns *T, convenient for configs with pointer fields
opts.Addr = "localhost:6379"
opts.PoolSize = 10             // connection pool
opts.MinIdleConns = 2
opts.DialTimeout = 5 * time.Second
opts.ReadTimeout = 3 * time.Second
opts.WriteTimeout = 3 * time.Second
rdb := redis.NewClient(opts)

// Atomic increment — safe under concurrent access
count, err := rdb.Incr(ctx, "page:views").Result()

// Pipelining — batch multiple commands in one round trip
pipe := rdb.Pipeline()
pipe.Set(ctx, "key1", "val1", time.Minute)
pipe.Set(ctx, "key2", "val2", time.Minute)
_, err = pipe.Exec(ctx)

// Lua script — atomic check-and-set
script := redis.NewScript(`
    local current = redis.call("GET", KEYS[1])
    if current == ARGV[1] then
        return redis.call("SET", KEYS[1], ARGV[2])
    end
    return 0
`)
result, err := script.Run(ctx, rdb, []string{"mykey"}, "old_value", "new_value").Int()
```

### Redis Data Structures for Caching

| Structure | Use Case |
|---|---|
| String | Single value cache, counters, feature flags |
| Hash | Object fields (avoids serialisation overhead for partial reads) |
| Sorted Set | Leaderboards, rate limiting with sliding window |
| List | Recent items, job queues |
| HyperLogLog | Approximate unique visitor count |
| Bloom Filter | Probabilistic cache existence check (via RedisBloom module) |

## In-Memory Caching in Go

For caches that live inside a single process (L1 cache), Go provides several options.

### sync.Map

`sync.Map` is a concurrency-safe map optimised for read-heavy workloads (many goroutines reading, rare writes). It uses a read-optimised fast path with atomic access and a slow path protected by a mutex for writes.

```go
var cache sync.Map

// Store
cache.Store("user:1", &User{ID: 1, Name: "Alice"})

// Load
if val, ok := cache.Load("user:1"); ok {
    user := val.(*User)
    fmt.Println(user.Name)
}

// LoadOrStore — atomic get-or-set
actual, loaded := cache.LoadOrStore("user:1", newUser)
if loaded {
    // 'actual' is the existing value
}

// Range — iterate all entries
cache.Range(func(key, value any) bool {
    fmt.Printf("%v → %v\n", key, value)
    return true // continue iteration
})
```

**Limitation:** `sync.Map` has no TTL, no eviction, and no size limit. For production use, wrap it with expiry logic or use a purpose-built library.

### LRU Cache

A Least-Recently-Used (LRU) cache evicts the least recently accessed entry when the cache is full. This is the most common in-memory eviction policy.

```go
import "container/list"

type LRU[K comparable, V any] struct {
    mu       sync.Mutex
    capacity int
    list     *list.List
    items    map[K]*list.Element
}

type entry[K comparable, V any] struct {
    key   K
    value V
}

func NewLRU[K comparable, V any](capacity int) *LRU[K, V] {
    return &LRU[K, V]{
        capacity: capacity,
        list:     list.New(),
        items:    make(map[K]*list.Element, capacity),
    }
}

func (c *LRU[K, V]) Get(key K) (V, bool) {
    c.mu.Lock()
    defer c.mu.Unlock()

    if elem, ok := c.items[key]; ok {
        c.list.MoveToFront(elem)
        return elem.Value.(*entry[K, V]).value, true
    }
    var zero V
    return zero, false
}

func (c *LRU[K, V]) Put(key K, value V) {
    c.mu.Lock()
    defer c.mu.Unlock()

    if elem, ok := c.items[key]; ok {
        c.list.MoveToFront(elem)
        elem.Value.(*entry[K, V]).value = value
        return
    }

    if c.list.Len() >= c.capacity {
        // Evict least recently used
        back := c.list.Back()
        if back != nil {
            c.list.Remove(back)
            delete(c.items, back.Value.(*entry[K, V]).key)
        }
    }

    e := &entry[K, V]{key: key, value: value}
    elem := c.list.PushFront(e)
    c.items[key] = elem
}
```

For production use, consider the well-maintained `github.com/hashicorp/golang-lru/v2` package, which provides generics-based LRU and ARC caches with TTL support.

## TTL and Cache Invalidation

**TTL (Time To Live)** is the simplest cache invalidation strategy: every cached entry expires after a fixed duration. It is self-healing — even if you forget to invalidate a key, it will eventually expire.

```go
// Set with TTL
rdb.Set(ctx, "user:42", userData, 5*time.Minute)

// Extend TTL on access (sliding window TTL)
func (s *Cache) Get(ctx context.Context, key string) ([]byte, error) {
    pipe := s.rdb.Pipeline()
    get := pipe.Get(ctx, key)
    pipe.Expire(ctx, key, s.slidingTTL)
    pipe.Exec(ctx)
    return get.Bytes()
}
```

**Cache invalidation strategies:**

1. **TTL-based expiry** — simplest, but stale window = TTL duration.
2. **Write-invalidate** — on write, delete the cache key immediately: `rdb.Del(ctx, key)`. The next read repopulates it.
3. **Event-driven invalidation** — publish a "data changed" event on a message bus; cache nodes subscribe and evict the relevant keys.
4. **Cache tags** — associate cache entries with logical tags (e.g., `user:42` tagged with `user`). Invalidating the tag invalidates all associated entries.

Phil Karlton's famous observation: "There are only two hard things in Computer Science: cache invalidation and naming things." In practice, use TTL as the default and add explicit invalidation only for the data that is most critical to keep fresh.

## Thundering Herd and Cache Stampede

### Thundering Herd

When a popular cache key expires, all concurrent requests that find a cache miss simultaneously fire requests to the database. If the key had 1000 requests/second, all 1000 hit the database at once.

**Solution: probabilistic early expiration.**

Instead of expiring the key at exactly TTL, start refreshing it slightly before expiry with a probability that increases as expiry approaches:

```go
// XFetch algorithm (optimal early recompute)
func (s *Cache) GetWithEarlyRefresh(ctx context.Context, key string, ttl time.Duration, fetch func() ([]byte, error)) ([]byte, error) {
    type cachedValue struct {
        Data    []byte
        Expiry  time.Time
        Delta   float64 // time it took to compute
    }

    // ... simplified: if remaining TTL < delta * beta * log(rand), refresh early
    val, err := s.rdb.Get(ctx, key).Bytes()
    if err != nil || shouldRefreshEarly(val, ttl) {
        fresh, err := fetch()
        if err != nil {
            return val, nil // serve stale on fetch error
        }
        s.rdb.Set(ctx, key, fresh, ttl)
        return fresh, nil
    }
    return val, nil
}
```

### Cache Stampede

Similar to thundering herd, but triggered by a cache node restarting or a deployment flushing the cache. All keys are cold simultaneously.

**Solutions:**

**1. Mutex/single-flight:** only one goroutine fetches from the database; others wait for the result.

```go
import "golang.org/x/sync/singleflight"

var group singleflight.Group

func (s *Cache) GetUser(ctx context.Context, id int64) (*User, error) {
    key := fmt.Sprintf("user:%d", id)

    // All concurrent calls for the same key share one database query
    v, err, _ := group.Do(key, func() (any, error) {
        cached, err := s.rdb.Get(ctx, key).Bytes()
        if err == nil {
            var u User
            json.Unmarshal(cached, &u)
            return &u, nil
        }

        user, err := s.db.GetUser(ctx, id)
        if err != nil {
            return nil, err
        }

        data, _ := json.Marshal(user)
        s.rdb.Set(ctx, key, data, 5*time.Minute)
        return user, nil
    })

    if err != nil {
        return nil, err
    }
    return v.(*User), nil
}
```

**2. Cache warming:** before a deployment, pre-populate the cache with frequently accessed keys using a background job.

**3. Staggered TTLs:** add a small random jitter to TTL values so that keys expire at different times, not all at once.

```go
jitter := time.Duration(rand.Int63n(int64(30 * time.Second)))
s.rdb.Set(ctx, key, data, 5*time.Minute+jitter)
```

## Self-Check Questions

1. **A read-heavy service uses cache-aside with a 10-minute TTL. A user updates their profile, but other users see the old version for up to 10 minutes. How would you fix this without reducing TTL?**
   *On profile update, explicitly `DEL` the cache key. The next read repopulates it.*

2. **What is the difference between thundering herd and cache stampede? Give a concrete scenario for each.**
   *Thundering herd: one popular key expires under high traffic → all concurrent readers hit the DB simultaneously. Cache stampede: a new deployment restarts or flushes Redis → all keys are cold simultaneously.*

3. **Why is `sync.Map` not suitable as a production LRU cache?**
   *It has no size limit, no TTL, and no eviction policy — it grows unboundedly.*

4. **Explain singleflight. How does it differ from a mutex?**
   *Singleflight deduplicates concurrent calls with the same key into one: the first caller runs the function, the rest wait and receive the same result. A mutex just serialises access without deduplication — all callers still execute the function sequentially.*
