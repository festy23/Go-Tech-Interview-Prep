---
title: Microservices Patterns
blockId: sysdesign-microservices
parentBlockId: sysdesign
---

# Microservices Patterns

Microservices architecture decomposes a system into small, independently deployable services that communicate over the network. The benefits are real — independent scaling, independent deployment, team autonomy, technology heterogeneity — but so are the costs: you have traded in-process function calls for network calls, and with that come latency, partial failure, and distributed-systems complexity.

This article covers the essential patterns every Go engineer working with microservices must know: API Gateway, Circuit Breaker, Retry with backoff, Saga, 2PC, service discovery, distributed tracing with OpenTelemetry, and health checks.

## API Gateway

An API Gateway is a single entry point for all client traffic. It sits in front of your microservices and handles cross-cutting concerns: authentication, rate limiting, request routing, TLS termination, and response aggregation.

```
                    ┌──── API Gateway ────┐
Client ─────────►  │  auth, rate limit   │ ──► User Service
                   │  routing, tracing   │ ──► Order Service
                   └─────────────────────┘ ──► Product Service
```

**Responsibilities:**
- **Authentication/Authorisation:** verify JWT or session tokens before routing. Only one service needs to implement this logic.
- **Rate limiting:** protect backend services from traffic spikes.
- **Request routing:** route `/users/*` to the user service, `/orders/*` to the order service.
- **Protocol translation:** HTTP/1.1 from clients → gRPC to internal services.
- **Response aggregation (BFF — Backend for Frontend):** combine responses from multiple services into one response for the client.

In Go, popular API Gateway implementations are:
- **Kong** or **NGINX** — standalone gateway with plugins.
- **go-chi + middleware chain** — lightweight in-process gateway for small deployments.
- **Envoy / Istio** — full service mesh with a gateway.

A simple in-process gateway middleware chain in Go:

```go
func main() {
    r := chi.NewRouter()

    r.Use(middleware.RequestID)
    r.Use(otelhttp.NewMiddleware("api-gateway")) // distributed tracing
    r.Use(authMiddleware)
    r.Use(rateLimitMiddleware(100)) // 100 req/s per IP

    // Proxy routes to backend services
    r.Mount("/users", reverseProxy(os.Getenv("USER_SERVICE_URL")))
    r.Mount("/orders", reverseProxy(os.Getenv("ORDER_SERVICE_URL")))

    http.ListenAndServe(":8080", r)
}

func reverseProxy(target string) http.Handler {
    url, _ := url.Parse(target)
    return httputil.NewSingleHostReverseProxy(url)
}
```

## Circuit Breaker

When service A calls service B and B is slow or unavailable, A's goroutines pile up waiting. Eventually A's connection pool, goroutine count, or memory is exhausted — A becomes unavailable too. This is a **cascading failure**.

The Circuit Breaker pattern prevents cascading failures. It monitors calls to a downstream service and, when failures exceed a threshold, "opens" the circuit — subsequent calls fail immediately (without hitting the downstream service) until the circuit is reset.

**States:**
- **Closed:** normal operation; requests pass through.
- **Open:** the failure threshold has been exceeded; all requests fail fast.
- **Half-Open:** after a timeout, a probe request is allowed through. If it succeeds, transition to Closed; if it fails, return to Open.

```go
import "github.com/sony/gobreaker/v2"

cb := gobreaker.NewCircuitBreaker[*http.Response](gobreaker.Settings{
    Name:        "inventory-service",
    MaxRequests: 1,    // max requests allowed in half-open state
    Interval:    60 * time.Second, // rolling window for counting failures
    Timeout:     30 * time.Second, // time in open state before half-open
    ReadyToTrip: func(counts gobreaker.Counts) bool {
        failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
        return counts.Requests >= 3 && failureRatio >= 0.6
    },
    OnStateChange: func(name string, from, to gobreaker.State) {
        log.Printf("circuit %s: %s → %s", name, from, to)
    },
})

func getInventory(ctx context.Context, productID string) (*Inventory, error) {
    resp, err := cb.Execute(func() (*http.Response, error) {
        return http.Get(fmt.Sprintf("%s/inventory/%s",
            os.Getenv("INVENTORY_URL"), productID))
    })
    if err != nil {
        if errors.Is(err, gobreaker.ErrOpenState) {
            // Fast fail — return cached value or default
            return defaultInventory(), nil
        }
        return nil, err
    }
    defer resp.Body.Close()
    // ...
}
```

## Retry with Backoff

Transient failures are common in distributed systems: a service restarts, a network hiccup lasts 100 ms, a database query times out. Retrying the request resolves most transient failures.

Naive retry: immediately retry on failure. This can amplify problems — if many clients all retry simultaneously, the recovering service is overwhelmed again.

**Exponential backoff** increases the delay between retries geometrically: wait 1 s, then 2 s, then 4 s, then 8 s. This gives the downstream service time to recover and reduces load.

**Jitter** adds randomness to the backoff to prevent all clients from retrying at the same time (the "thundering herd" problem at the retry level):

```go
func retryWithBackoff(ctx context.Context, maxRetries int, fn func() error) error {
    baseDelay := 100 * time.Millisecond
    maxDelay := 30 * time.Second

    for attempt := range maxRetries {
        if err := fn(); err == nil {
            return nil
        } else if !isRetryable(err) {
            return err // permanent error — do not retry
        }

        // Full jitter: random delay in [0, min(base*2^attempt, maxDelay)]
        cap := min(float64(baseDelay)*math.Pow(2, float64(attempt)), float64(maxDelay))
        sleep := time.Duration(rand.Float64() * cap)

        select {
        case <-time.After(sleep):
        case <-ctx.Done():
            return ctx.Err()
        }
    }
    return fmt.Errorf("max retries (%d) exceeded", maxRetries)
}

func isRetryable(err error) bool {
    var httpErr *HTTPError
    if errors.As(err, &httpErr) {
        // Retry on 5xx and 429 (rate limited), not on 4xx (client errors)
        return httpErr.StatusCode >= 500 || httpErr.StatusCode == 429
    }
    return true // retry on network errors by default
}
```

**Important:** only retry **idempotent** operations. Retrying a `POST /orders` might create duplicate orders. Use idempotency keys:

```go
req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, body)
req.Header.Set("Idempotency-Key", requestID) // server deduplicates by this key
```

## Saga Pattern

A Saga is the distributed-systems answer to long-running multi-step transactions that span multiple services.

**The problem:** service A debits an account, service B ships the product, service C updates the loyalty points. If service C fails, how do you roll back what A and B already did?

Two-phase commit (2PC) is the classic answer, but it requires all participants to lock resources for the duration of the transaction — this is slow and fragile in microservices with heterogeneous databases.

A Saga breaks the distributed transaction into a sequence of local transactions, each publishing an event. On failure, compensating transactions are executed in reverse order.

**Choreography-based Saga** (event-driven, no central coordinator):

```
Order Service     → publishes OrderCreated
Payment Service   → consumes OrderCreated, publishes PaymentProcessed
Inventory Service → consumes PaymentProcessed, publishes InventoryReserved
Shipping Service  → consumes InventoryReserved, publishes OrderShipped

On failure (e.g., payment fails):
Payment Service   → publishes PaymentFailed
Order Service     → consumes PaymentFailed, cancels the order (compensating transaction)
```

**Orchestration-based Saga** (central saga orchestrator):

```go
type OrderSaga struct {
    orderSvc     OrderService
    paymentSvc   PaymentService
    inventorySvc InventoryService
}

func (s *OrderSaga) Execute(ctx context.Context, order *Order) error {
    // Step 1: create order
    if err := s.orderSvc.Create(ctx, order); err != nil {
        return err
    }

    // Step 2: process payment
    if err := s.paymentSvc.Charge(ctx, order); err != nil {
        // Compensate step 1
        s.orderSvc.Cancel(ctx, order.ID) // compensating transaction
        return fmt.Errorf("payment failed: %w", err)
    }

    // Step 3: reserve inventory
    if err := s.inventorySvc.Reserve(ctx, order); err != nil {
        // Compensate steps 1 and 2
        s.paymentSvc.Refund(ctx, order.ID)  // compensating transaction
        s.orderSvc.Cancel(ctx, order.ID)     // compensating transaction
        return fmt.Errorf("inventory reservation failed: %w", err)
    }

    return nil
}
```

**Saga vs 2PC:**
- Saga: eventual consistency, no global lock, each service uses its own local transaction.
- 2PC: strong consistency, but requires a coordinator, locks resources across all participants, and has availability problems if the coordinator fails.

In practice, Saga (orchestrated) + idempotent operations is the recommended pattern for microservices.

## Service Discovery

Service discovery is how services find each other. In a dynamic environment with auto-scaling and rolling deployments, service instances come and go — you cannot hardcode IP addresses.

**Two models:**

**Client-side discovery:** the client queries a service registry (Consul, etcd) and selects an instance to call, implementing its own load balancing.

```go
import "github.com/hashicorp/consul/api"

client, _ := api.NewClient(api.DefaultConfig())
services, _, _ := client.Health().Service("inventory-service", "", true, nil)

if len(services) == 0 {
    return fmt.Errorf("no healthy instances of inventory-service")
}
// Simple round-robin selection
instance := services[idx%len(services)]
addr := fmt.Sprintf("%s:%d", instance.Service.Address, instance.Service.Port)
```

**Server-side discovery (load balancer):** the client calls a stable DNS name or virtual IP. The load balancer (Kubernetes Service, AWS ALB, Nginx) resolves instances. This is the default in Kubernetes.

**Kubernetes** provides built-in service discovery via DNS:
- `http://inventory-service` resolves to the ClusterIP.
- `http://inventory-service.production.svc.cluster.local` for cross-namespace.

For gRPC in Kubernetes, use the `dns:///` scheme with client-side load balancing across pod IPs:

```go
conn, err := grpc.NewClient(
    "dns:///inventory-service:50051",
    grpc.WithDefaultServiceConfig(`{"loadBalancingConfig": [{"round_robin":{}}]}`),
    grpc.WithTransportCredentials(insecure.NewCredentials()),
)
```

## Distributed Tracing with OpenTelemetry

In a monolith, a single request is visible in one log. In microservices, a single user request may touch 5–10 services. Without distributed tracing, debugging latency or errors across services is nearly impossible.

**Key concepts:**
- **Trace:** the complete journey of a request, consisting of spans.
- **Span:** a single operation within a trace (one HTTP call, one DB query). It has a start time, duration, and metadata (attributes, events, status).
- **Context propagation:** passing the trace ID and span ID in request headers so that spans in different services can be linked.

OpenTelemetry is the CNCF standard for distributed tracing (and metrics and logs). In Go:

```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
    "go.opentelemetry.io/otel/sdk/trace"
    "go.opentelemetry.io/otel/propagation"
)

func initTracer(ctx context.Context) (func(), error) {
    exporter, err := otlptracehttp.New(ctx,
        otlptracehttp.WithEndpoint("http://otel-collector:4318"),
    )
    if err != nil {
        return nil, err
    }

    tp := trace.NewTracerProvider(
        trace.WithBatcher(exporter),
        trace.WithResource(resource.NewWithAttributes(
            semconv.SchemaURL,
            semconv.ServiceNameKey.String("order-service"),
        )),
    )
    otel.SetTracerProvider(tp)
    otel.SetTextMapPropagator(propagation.TraceContext{})

    return func() { tp.Shutdown(ctx) }, nil
}

// Instrument HTTP server
mux.Handle("/orders", otelhttp.NewHandler(orderHandler, "handle-order"))

// Instrument outgoing HTTP calls
client := &http.Client{
    Transport: otelhttp.NewTransport(http.DefaultTransport),
}

// Manual span creation
func processOrder(ctx context.Context, order *Order) error {
    ctx, span := otel.Tracer("order-service").Start(ctx, "processOrder")
    defer span.End()

    span.SetAttributes(
        attribute.String("order.id", order.ID),
        attribute.Float64("order.total", order.Total),
    )

    if err := validateOrder(ctx, order); err != nil {
        span.RecordError(err)
        span.SetStatus(codes.Error, err.Error())
        return err
    }
    return nil
}
```

W3C Trace Context headers (`traceparent`, `tracestate`) are automatically propagated via `otelhttp` middleware — downstream services receive them and continue the same trace.

**Sampling:** tracing every request at high traffic is expensive. Configure a sampling ratio:

```go
trace.WithSampler(trace.TraceIDRatioBased(0.1)) // sample 10% of requests
```

Or use **parent-based sampling**: if the caller already sampled the request, the downstream service must also sample (to keep the trace complete).

## Health Checks

Health checks expose the service's readiness to receive traffic. A load balancer or Kubernetes kubelet polls health check endpoints and removes unhealthy instances from rotation.

**Two types:**
- **Liveness:** is the process alive? If not, restart it. A liveness check should be very lightweight — it proves the process has not deadlocked.
- **Readiness:** is the service ready to serve traffic? If not, stop routing to it. A readiness check verifies that all dependencies (database, downstream services) are accessible.

```go
func healthHandler(db *pgxpool.Pool, rdb *redis.Client) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
        defer cancel()

        checks := map[string]error{
            "postgres": db.Ping(ctx),
            "redis":    rdb.Ping(ctx).Err(),
        }

        healthy := true
        for _, err := range checks {
            if err != nil {
                healthy = false
                break
            }
        }

        if !healthy {
            w.WriteHeader(http.StatusServiceUnavailable)
        } else {
            w.WriteHeader(http.StatusOK)
        }
        json.NewEncoder(w).Encode(checks)
    }
}

// Register endpoints
mux.HandleFunc("/healthz/live", func(w http.ResponseWriter, _ *http.Request) {
    w.WriteHeader(http.StatusOK) // just "am I running?"
})
mux.HandleFunc("/healthz/ready", healthHandler(db, rdb))
```

In Kubernetes:

```yaml
livenessProbe:
  httpGet:
    path: /healthz/live
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /healthz/ready
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 5
  failureThreshold: 3
```

## Putting It Together

A robust Go microservice combines all these patterns:

```go
func main() {
    ctx := context.Background()

    // Tracing
    shutdown, _ := initTracer(ctx)
    defer shutdown()

    // Dependencies
    db, _ := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
    rdb := redis.NewClient(&redis.Options{Addr: os.Getenv("REDIS_ADDR")})

    // Circuit breaker for downstream calls
    cb := gobreaker.NewCircuitBreaker[*http.Response](gobreaker.Settings{
        Name:    "downstream",
        Timeout: 30 * time.Second,
        ReadyToTrip: func(c gobreaker.Counts) bool {
            return c.ConsecutiveFailures > 5
        },
    })

    svc := &OrderService{db: db, cache: rdb, cb: cb}

    mux := chi.NewRouter()
    mux.Use(otelhttp.NewMiddleware("order-service"))
    mux.Use(middleware.Recoverer)
    mux.HandleFunc("/healthz/live", livenessHandler)
    mux.HandleFunc("/healthz/ready", readinessHandler(db, rdb))
    mux.Mount("/orders", orderRoutes(svc))

    srv := &http.Server{Addr: ":8080", Handler: mux}

    // Graceful shutdown
    go func() {
        stop := make(chan os.Signal, 1)
        signal.Notify(stop, syscall.SIGTERM, syscall.SIGINT)
        <-stop
        shutCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
        defer cancel()
        srv.Shutdown(shutCtx)
    }()

    srv.ListenAndServe()
}
```

## Self-Check Questions

1. **Service A calls Service B. Service B starts responding slowly (10 s timeout). Describe what happens without a circuit breaker and with one.**
   *Without: A's goroutines pile up waiting for B; A exhausts its connection pool and becomes unresponsive. With circuit breaker: after a few failures, the circuit opens; A fails fast and can return a cached or degraded response, preventing cascade.*

2. **What is the difference between orchestration-based and choreography-based Saga?**
   *Orchestration: a central saga orchestrator coordinates steps and triggers compensations. Choreography: each service reacts to events from the previous step and publishes its own events. Choreography has no central point of failure but is harder to trace; orchestration is more explicit but adds a coordinator dependency.*

3. **How does context propagation work in OpenTelemetry?**
   *The first service starts a trace and injects the trace ID and span ID into HTTP headers (`traceparent`). Each downstream service extracts the context from incoming headers, creates a child span, and injects the updated context into its own outgoing calls. All spans share the same trace ID and can be displayed as a unified trace timeline.*

4. **Why should liveness and readiness checks be separate endpoints?**
   *Liveness failures cause the container to restart — it should only be triggered if the process is truly stuck (deadlock, out of memory). Readiness failures stop routing traffic to the instance without restarting it — appropriate when a dependency is temporarily unavailable. Using the same endpoint for both would cause unnecessary restarts when a database is briefly unreachable.*
