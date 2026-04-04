/**
 * Migration: convert flat Russian strings to bilingual { ru, en } format.
 * Safe to re-run — skips documents already migrated (where field is an object).
 *
 * Run: pnpm --filter @quiz/backend exec tsx --tsconfig tsconfig.seed.json scripts/migrate-i18n.ts
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'
import { env } from '../src/env.js'

// ── English translations for blocks ─────────────────────────────────────────

const BLOCK_TRANSLATIONS: Record<string, { title: string; topics: string[] }> = {
  primitives: {
    title: 'Go Primitives',
    topics: [
      'Data types', 'Strings and runes', 'Constants and iota',
      'Pointers', 'Arrays and slices', 'Maps',
      'Structs and tags', 'Functions and closures', 'Packages and modules',
      'Visibility and init()', 'Generics (Go 1.18+)',
    ],
  },
  oop: {
    title: 'OOP in Go',
    topics: [
      'Interfaces and implicit implementation', 'Struct embedding',
      'Composition over inheritance', 'Polymorphism via interfaces',
      'Empty interface (any)', 'Type assertions', 'Type switch',
      'SOLID principles in Go', 'Dependency Injection',
    ],
  },
  sql: {
    title: 'SQL',
    topics: [
      'SELECT, JOIN, GROUP BY, HAVING', 'Indexes: B-tree, composite, covering',
      'Transactions and ACID', 'Isolation levels', 'Database deadlocks',
      'Window functions: RANK, ROW_NUMBER, LEAD/LAG',
      'CTE and recursive queries', 'EXPLAIN ANALYZE',
      'N+1 problem', 'database/sql in Go', 'Connection pooling',
    ],
  },
  concurrency: {
    title: 'Go Concurrency',
    topics: [
      'Goroutines and GMP scheduler', 'Channels: buffered and unbuffered',
      'select and channel patterns', 'Pipeline, Fan-out/Fan-in',
      'Channel-based semaphore', 'sync.Mutex and RWMutex',
      'sync.WaitGroup, sync.Once', 'sync/atomic', 'sync.Pool',
      'Data race and -race detector', 'Goroutine leak and context.Context',
      'errgroup', 'Worker Pool pattern',
    ],
  },
  networks: {
    title: 'Networks and Linux',
    topics: [
      'TCP/IP: 3-way handshake, TIME_WAIT', 'HTTP/1.1 vs HTTP/2',
      'TLS/HTTPS: certificates, mTLS', 'DNS and CDN',
      'epoll/kqueue and netpoll in Go', 'Blocking vs non-blocking I/O',
      'Process vs thread vs goroutine', 'Signals: SIGTERM, SIGINT',
      'Linux CFS scheduler', 'mmap and file descriptors',
    ],
  },
  server: {
    title: 'Go Server Development',
    topics: [
      'net/http: Handler, ServeMux, Middleware', 'gRPC and protobuf',
      'WebSockets', 'Graceful shutdown with context + os/signal',
      'Health checks and readiness probes', 'Structured logging: slog/zap/zerolog',
      'Configuration management: viper, 12-factor', 'Dependency Injection in Go',
      'Hexagonal Architecture', 'OpenTelemetry and tracing',
    ],
  },
  sysdesign: {
    title: 'System Design Go',
    topics: [
      'Horizontal vs vertical scaling',
      'CAP theorem', 'Consistent hashing', 'Rate limiting',
      'Circuit breaker, Retry with backoff', 'Kafka / NATS / RabbitMQ',
      'Saga pattern, 2PC', 'LRU Cache with TTL', 'URL Shortener',
      'Pub/Sub system', 'Job Queue / Task Scheduler',
    ],
  },
}

async function main() {
  const client = new MongoClient(env.MONGODB_URI)
  await client.connect()
  const db = client.db(env.MONGODB_DB_NAME)

  // ── Migrate blocks ────────────────────────────────────────────────────────
  console.log('\n[migrate] Migrating blocks...')
  const blocksCol = db.collection('blocks')
  const blocks = await blocksCol.find({}).toArray()
  let blocksMigrated = 0

  for (const block of blocks) {
    // Skip if already migrated (title is an object)
    if (typeof block.title === 'object' && block.title !== null) {
      console.log(`[migrate] Block "${block.blockId}" already migrated, skipping`)
      continue
    }

    const en = BLOCK_TRANSLATIONS[block.blockId]
    if (!en) {
      console.warn(`[migrate] No translation for block "${block.blockId}", using empty strings`)
    }

    await blocksCol.updateOne(
      { _id: block._id },
      {
        $set: {
          title: { ru: block.title, en: en?.title ?? '' },
          topics: { ru: block.topics, en: en?.topics ?? [] },
          updatedAt: new Date(),
        },
      },
    )
    blocksMigrated++
  }
  console.log(`[migrate] ${blocksMigrated} blocks migrated`)

  // ── Migrate questions ─────────────────────────────────────────────────────
  console.log('\n[migrate] Migrating questions...')
  const questionsCol = db.collection('questions')
  const questions = await questionsCol.find({}).toArray()
  let questionsMigrated = 0
  let questionsSkipped = 0

  for (const q of questions) {
    // Skip if already migrated (question is an object)
    if (typeof q.question === 'object' && q.question !== null) {
      questionsSkipped++
      continue
    }

    await questionsCol.updateOne(
      { _id: q._id },
      {
        $set: {
          question: { ru: q.question, en: '' },
          options: { ru: q.options, en: ['', '', '', ''] },
          explanation: { ru: q.explanation, en: '' },
          updatedAt: new Date(),
        },
      },
    )
    questionsMigrated++
  }
  console.log(`[migrate] ${questionsMigrated} questions migrated, ${questionsSkipped} skipped`)

  console.log('\n[migrate] Done!')
  await client.close()
}

main().catch((err) => {
  console.error('[migrate] Error:', err)
  process.exit(1)
})
