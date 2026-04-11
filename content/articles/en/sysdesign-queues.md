---
title: Message Queues
blockId: sysdesign-queues
parentBlockId: sysdesign
---

# Message Queues

Message queues are the glue of distributed systems. They decouple the systems that produce events from the systems that consume them, absorb bursts of traffic, enable retry-on-failure, and form the backbone of event-driven and microservices architectures.

This article covers the three most common queuing systems in the Go ecosystem — Kafka, NATS, and RabbitMQ — and the architectural patterns built on top of them: pub/sub, event sourcing, CQRS, and the various delivery semantics that determine what happens when things go wrong.

## Why Queues?

Without a queue, service A calls service B synchronously:

```
Client → Service A → Service B
```

If service B is slow, the client waits. If service B is down, the request fails. If traffic spikes, service B is overwhelmed.

With a queue:

```
Client → Service A → Queue → Service B (async)
```

Service A writes the message and returns immediately. Service B processes it when it is ready. The queue buffers spikes, provides durability if service B is down, and decouples deployment cycles.

**When to use queues:**
- Workloads that are CPU-intensive or have high I/O (email sending, image processing, report generation).
- Workflows spanning multiple services where each step can fail independently.
- Fanout patterns where one event must trigger multiple independent actions.
- Audit logs and event sourcing, where the order and durability of events matter.

**When NOT to use queues:**
- The caller needs a synchronous response (use HTTP/gRPC instead).
- You need strong ACID transactions across the message and the database (consider transactional outbox pattern instead).
- The operational overhead outweighs the benefit — for a small team, a simple PostgreSQL LISTEN/NOTIFY can replace a full Kafka setup.

## Kafka

Kafka is a distributed log. It appends events to partitioned, replicated logs (topics) and retains them for a configurable period. Consumers read events by position (offset) and can replay from any point.

**Core concepts:**
- **Topic:** a named stream of events, partitioned across brokers.
- **Partition:** an ordered, immutable log segment. A topic can have 1–1000 partitions; more partitions = more parallelism but more overhead.
- **Offset:** the position of a message within a partition. Consumers track their own offset; Kafka does not delete messages on consumption.
- **Consumer group:** multiple consumers in a group each read a distinct partition — enabling parallel consumption with ordering within each partition.

**Delivery guarantee:** Kafka provides **at-least-once** by default. With `acks=all` (producer) + idempotent consumer, you achieve **exactly-once** semantics within a single cluster (via transactions).

**Best suited for:**
- High-throughput event streams (millions of events/second).
- Event replay and event sourcing — consumers can rewind to any offset.
- Audit logs that must be retained for weeks or months.
- Stream processing with Kafka Streams or Apache Flink.

**Go client:** `github.com/segmentio/kafka-go` or `github.com/confluentinc/confluent-kafka-go`.

```go
import "github.com/segmentio/kafka-go"

// Producer
writer := &kafka.Writer{
    Addr:                   kafka.TCP("localhost:9092"),
    Topic:                  "user-events",
    Balancer:               &kafka.LeastBytes{},
    RequiredAcks:           kafka.RequireAll, // acks=all
    AllowAutoTopicCreation: true,
}
defer writer.Close()

err := writer.WriteMessages(ctx,
    kafka.Message{
        Key:   []byte(userID),
        Value: eventJSON,
    },
)

// Consumer
reader := kafka.NewReader(kafka.ReaderConfig{
    Brokers:  []string{"localhost:9092"},
    GroupID:  "notification-service",
    Topic:    "user-events",
    MinBytes: 10e3, // 10 KB
    MaxBytes: 10e6, // 10 MB
})
defer reader.Close()

for {
    msg, err := reader.ReadMessage(ctx)
    if err != nil {
        break
    }
    processEvent(msg.Value)
    // Offset is committed automatically with ReadMessage
    // Use FetchMessage + CommitMessages for manual control
}
```

## NATS

NATS is a lightweight, high-performance messaging system designed for cloud-native and edge deployments. It is simpler and faster than Kafka but with weaker durability guarantees by default.

**Core concepts:**
- **Subject:** a string like `orders.created` or `user.>` (wildcard). No partitions — any subscriber matching the subject receives the message.
- **Core NATS:** fire-and-forget, in-memory only. Messages not delivered to a subscriber are lost.
- **NATS JetStream:** persistent, durable streams built on top of Core NATS, with configurable retention, replay, and at-least-once delivery.

**Delivery guarantees:**
- Core NATS: **at-most-once** (if the subscriber is offline, the message is lost).
- JetStream: **at-least-once** with acknowledgements; **exactly-once** with deduplication window.

**Best suited for:**
- Real-time, low-latency messaging (IoT telemetry, game state synchronisation, live notifications).
- Service mesh communication as an alternative to gRPC for internal services.
- Workloads that can tolerate message loss (metrics, monitoring heartbeats).
- Small teams who want low operational overhead (NATS is a single binary with no Zookeeper/Kafka ecosystem requirements).

**Go client:** `github.com/nats-io/nats.go`.

```go
import "github.com/nats-io/nats.go"

nc, _ := nats.Connect("nats://localhost:4222")
defer nc.Drain()

// Publish (fire-and-forget)
nc.Publish("orders.created", orderJSON)

// Subscribe
nc.Subscribe("orders.*", func(msg *nats.Msg) {
    fmt.Printf("Received on %s: %s\n", msg.Subject, msg.Data)
})

// JetStream — durable, with ack
js, _ := nc.JetStream()
js.Publish("ORDERS.created", orderJSON)

sub, _ := js.Subscribe("ORDERS.*", func(msg *nats.Msg) {
    process(msg.Data)
    msg.Ack() // manual acknowledgement
}, nats.Durable("order-processor"), nats.ManualAck())
```

## RabbitMQ

RabbitMQ is a traditional message broker based on the AMQP protocol. It models communication through **exchanges** and **queues**: producers publish to an exchange, which routes messages to queues based on routing keys and binding rules.

**Core concepts:**
- **Exchange types:** `direct` (exact match), `topic` (pattern match with `.` and `*`/`#`), `fanout` (broadcast), `headers` (metadata-based routing).
- **Queue:** where messages wait. Can be durable (survives restart), exclusive (single consumer), and auto-deleted.
- **Binding:** a rule connecting an exchange to a queue, optionally with a routing key.
- **Acknowledgements:** the consumer sends an `ack` when processing is complete. If the consumer disconnects without acking, the message is requeued.

**Delivery guarantee:** **at-least-once** with manual acks. Exactly-once requires idempotent consumers.

**Best suited for:**
- Complex routing logic (route by type, priority, tenant, etc.).
- Tasks that require exactly-once visibility (via exclusive consumers).
- Traditional queue-based task distribution (worker pool pattern).
- Protocol interoperability — AMQP is well-supported across languages and frameworks.

**Go client:** `github.com/rabbitmq/amqp091-go`.

```go
import amqp "github.com/rabbitmq/amqp091-go"

conn, _ := amqp.Dial("amqp://guest:guest@localhost:5672/")
ch, _ := conn.Channel()
defer ch.Close()

// Declare queue
q, _ := ch.QueueDeclare("task_queue", true, false, false, false, nil)

// Publish
ch.Publish("", q.Name, false, false, amqp.Publishing{
    DeliveryMode: amqp.Persistent, // survives broker restart
    ContentType:  "application/json",
    Body:         taskJSON,
})

// Consume
msgs, _ := ch.Consume(q.Name, "", false, false, false, false, nil)
for msg := range msgs {
    processTask(msg.Body)
    msg.Ack(false) // manual ack
}
```

## When to Choose Which

| Criterion | Kafka | NATS (JetStream) | RabbitMQ |
|---|---|---|---|
| Throughput | Very high (millions/s) | High (tens of thousands/s) | Medium (thousands/s) |
| Latency | 5–15 ms | < 1 ms | 1–5 ms |
| Retention & replay | Yes (weeks/months) | Yes (configurable) | No (consumed → deleted) |
| Delivery semantics | At-least-once / exactly-once | At-most-once / at-least-once | At-least-once |
| Routing | Topic + partition | Subject (wildcard) | Exchange + routing key |
| Operational complexity | High (Kafka + Zookeeper/KRaft) | Low (single binary) | Medium (management UI included) |
| Best for | Event sourcing, audit log, analytics | IoT, realtime, microservices mesh | Task queues, complex routing |

## Pub/Sub Pattern

In pub/sub (publish/subscribe), publishers send messages to a topic without knowing who receives them. Subscribers register interest in a topic and receive all matching messages.

```
Publisher A ──┐
              ├──► Topic: "order.created" ──► Subscriber 1 (inventory service)
Publisher B ──┘                          ──► Subscriber 2 (notification service)
                                         ──► Subscriber 3 (analytics service)
```

The decoupling is bidirectional: publishers don't know subscribers exist; subscribers don't know who publishes. Adding a new consumer requires zero changes to the publisher.

In Go with NATS:

```go
// Publisher — does not know who is listening
nc.Publish("order.created", orderJSON)

// Multiple independent subscribers
nc.Subscribe("order.created", inventoryHandler)
nc.Subscribe("order.created", notificationHandler)
nc.Subscribe("order.created", analyticsHandler)
```

## Event Sourcing

Event sourcing is an architectural pattern where the state of an entity is derived entirely from an ordered log of events, rather than storing only the current state.

```
Instead of:                Instead, store:
orders table               events table (append-only)
─────────────              ─────────────────────────────────────
id: 42                     id: 1, order_id: 42, type: OrderCreated,  data: {...}
status: shipped            id: 2, order_id: 42, type: PaymentReceived, data: {...}
items: [...]               id: 3, order_id: 42, type: OrderShipped,  data: {...}
```

**Advantages:**
- Full audit trail — you know exactly what happened and when.
- Temporal queries — reconstruct the state at any point in time.
- Replay — reprocess all events with new logic (useful for bug fixes and new features).
- Natural fit for event-driven architectures.

**Disadvantages:**
- Reading current state requires replaying all events (mitigated by snapshots).
- Schema evolution for old events is hard.
- Not suitable for all domains — a simple CRUD inventory doesn't benefit much.

Event sourcing and Kafka are a natural pairing: Kafka's retention and offset-based replay map directly to event log semantics.

## CQRS (Command Query Responsibility Segregation)

CQRS separates write operations (commands) from read operations (queries) using different models, often different databases.

```
                ┌─ Command side ─┐
Client ──write──► Command Handler → Write DB (PostgreSQL, events)
                └────────────────┘
                        │ publishes events
                        ▼
                ┌─ Query side ─────┐
Client ──read───► Query Handler  ← Read DB (Redis, Elasticsearch, denormalised)
                └──────────────────┘
```

The query model is updated asynchronously by consuming events from the command side. It can be optimised separately for read performance (e.g., a fully denormalised Elasticsearch index) without affecting write performance.

CQRS is most valuable when:
- Read and write load profiles are very different.
- You need multiple read representations of the same data (for different API clients).
- The write model is complex (event sourcing) and the read model needs to be simple.

## Delivery Semantics

### At-Most-Once

The message is delivered zero or one time. If the network drops the acknowledgement, the message is not retried.

- **When acceptable:** metrics, telemetry, real-time notifications where missing a message is preferable to duplicate processing.
- **Default in:** Core NATS, UDP-based systems.

### At-Least-Once

The message is delivered one or more times. If the acknowledgement is lost, the broker retries until it receives confirmation.

- **Consequence:** duplicate messages are possible. Consumers must be **idempotent** — processing the same message twice produces the same result.
- **Default in:** Kafka (with acks), RabbitMQ (with acks), NATS JetStream.

Idempotency in Go:

```go
func processOrder(ctx context.Context, orderID string) error {
    // Idempotency check: was this already processed?
    exists, err := db.ExistsProcessedOrder(ctx, orderID)
    if err != nil {
        return err
    }
    if exists {
        return nil // already processed — safe to skip
    }

    // Process atomically with idempotency record
    return db.WithTx(ctx, func(tx *sql.Tx) error {
        if err := fulfillOrder(ctx, tx, orderID); err != nil {
            return err
        }
        return markOrderProcessed(ctx, tx, orderID)
    })
}
```

### Exactly-Once

The message is delivered and processed exactly once, even in the presence of retries and failures.

- **How:** producer-side idempotence (Kafka assigns a sequence number; duplicates are discarded) + consumer-side transactional commits (Kafka transactions, or idempotent consumers with deduplication).
- **Cost:** significant overhead — transactions, two-phase commits, higher latency.
- **When to use:** financial transactions, billing events, inventory changes where duplicates cause real business harm.

## Dead Letter Queues

A dead letter queue (DLQ) is a separate queue that receives messages that could not be processed successfully after N retries.

```go
// RabbitMQ — configure DLQ at queue declaration
args := amqp.Table{
    "x-dead-letter-exchange":    "dlx",
    "x-dead-letter-routing-key": "dead",
    "x-message-ttl":             int32(5000), // retry after 5s
    "x-max-retries":             int32(3),
}
ch.QueueDeclare("task_queue", true, false, false, false, args)

// After 3 failed processing attempts, RabbitMQ routes to DLQ automatically
```

A DLQ enables:
- **Visibility:** dead-lettered messages can be inspected and debugged.
- **Alerting:** a DLQ growing beyond a threshold should trigger an alert.
- **Reprocessing:** after fixing the bug, messages can be replayed from the DLQ.

In Kafka, DLQ is a convention (typically a `<topic>-dlt` topic), implemented in the consumer:

```go
func consumeWithDLQ(ctx context.Context, msg kafka.Message) {
    const maxRetries = 3

    for attempt := range maxRetries {
        if err := processMessage(ctx, msg); err != nil {
            if attempt == maxRetries-1 {
                // Publish to DLQ
                dlqWriter.WriteMessages(ctx, kafka.Message{
                    Key:   msg.Key,
                    Value: msg.Value,
                    Headers: []kafka.Header{
                        {Key: "error", Value: []byte(err.Error())},
                        {Key: "original-topic", Value: []byte(msg.Topic)},
                    },
                })
            }
            time.Sleep(backoff(attempt))
            continue
        }
        return
    }
}

func backoff(attempt int) time.Duration {
    return time.Duration(math.Pow(2, float64(attempt))) * time.Second
}
```

## Self-Check Questions

1. **An order service publishes an "order created" event. Three downstream services consume it: inventory, notification, and analytics. Should they use a single shared consumer group or three separate ones? Why?**
   *Three separate consumer groups. Each group has its own offset position and processes every message independently. A shared group would split messages between consumers — each message delivered to only one of the three.*

2. **What is the difference between at-least-once and exactly-once delivery? What must a consumer implement to safely handle at-least-once delivery?**
   *At-least-once: messages may be duplicated on retry. Exactly-once: processed exactly once even under failure. For at-least-once: consumers must be idempotent (check if message was already processed; skip or merge if so).*

3. **Describe the transactional outbox pattern. What problem does it solve?**
   *A service writes a business event to an "outbox" table in the same database transaction as its business data write. A separate poller reads the outbox and publishes to the queue. This guarantees that the database write and the message publication are atomic — solving the dual-write problem.*

4. **When would you choose RabbitMQ over Kafka for a task queue?**
   *When you need complex per-message routing (by type, tenant, priority), when messages should be deleted after processing (no long-term retention needed), or when operational simplicity is more important than throughput and replay capability.*
