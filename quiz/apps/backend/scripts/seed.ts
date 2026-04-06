/**
 * Seed script: migrates existing questions from frontend TS files into MongoDB.
 * Safe to re-run — uses upsert on legacyId.
 *
 * Run: pnpm --filter @quiz/backend seed
 */
import 'dotenv/config'
import { MongoClient, ObjectId } from 'mongodb'
import { env } from '../src/env.js'

// ── Import legacy question data ───────────────────────────────────────────────
import { questions } from '../../frontend/src/data/questions.js'
import { questions2 } from '../../frontend/src/data/questions2.js'
import { questions3 } from '../../frontend/src/data/questions3.js'
import { questionsOop } from '../../frontend/src/data/questions-oop.js'
import { questionsSql } from '../../frontend/src/data/questions-sql.js'
import { questionsNetworks } from '../../frontend/src/data/questions-networks.js'

// ── Block mapping ─────────────────────────────────────────────────────────────
const QUIZ_TO_BLOCK: Record<number, string | null> = {
  1: null,
  2: null,
  3: 'concurrency',
  4: 'oop',
  5: 'sql',
  6: 'networks',
}

// ── Block definitions (for seeding the blocks collection) ──────────────────────
const BLOCKS = [
  {
    blockId: 'primitives',
    title: { ru: 'Примитивы Go', en: 'Go Primitives' },
    subtitle: { ru: 'Типы данных, указатели, структуры, дженерики', en: 'Types, pointers, structs, generics' },
    difficulty: 'basic' as const,
    topicCount: 40,
    topics: {
      ru: ['Типы данных', 'Строки и руны', 'Константы и iota', 'Указатели', 'Массивы и слайсы', 'Карты (map)', 'Структуры и теги', 'Функции и замыкания', 'Пакеты и модули', 'Видимость и init()', 'Дженерики (Go 1.18+)'],
      en: ['Data types', 'Strings and runes', 'Constants and iota', 'Pointers', 'Arrays and slices', 'Maps', 'Structs and tags', 'Functions and closures', 'Packages and modules', 'Visibility and init()', 'Generics (Go 1.18+)'],
    },
    quizId: null,
    gridRow: 1,
    gridCol: 2,
    color: '#58a6ff',
  },
  {
    blockId: 'oop',
    title: { ru: 'ООП в Go', en: 'OOP in Go' },
    subtitle: { ru: 'Интерфейсы, композиция, SOLID, паттерны', en: 'Interfaces, composition, SOLID, patterns' },
    difficulty: 'basic-intermediate' as const,
    topicCount: 50,
    topics: {
      ru: ['Методы и ресиверы', 'Интерфейсы — продвинутое', 'Композиция и встраивание', 'Полиморфизм через интерфейсы', 'SOLID-принципы в Go', 'Dependency Injection', 'Стандартные интерфейсы', 'Паттерны проектирования'],
      en: ['Methods and receivers', 'Interfaces (advanced)', 'Composition and embedding', 'Polymorphism via interfaces', 'SOLID principles in Go', 'Dependency Injection', 'Standard interfaces', 'Design patterns'],
    },
    quizId: 4,
    gridRow: 2,
    gridCol: 1,
    color: '#79c0ff',
  },
  {
    blockId: 'sql',
    title: { ru: 'SQL', en: 'SQL & Databases' },
    subtitle: { ru: 'JOINs, индексы, транзакции, database/sql в Go', en: 'JOINs, indexes, transactions, database/sql in Go' },
    difficulty: 'intermediate' as const,
    topicCount: 50,
    topics: {
      ru: ['JOINs и подзапросы', 'GROUP BY, HAVING, агрегация', 'CTE и рекурсивные запросы', 'Оконные функции', 'Индексы: B-tree, составные, покрывающие', 'Транзакции и блокировки', 'EXPLAIN ANALYZE', 'N+1 проблема', 'database/sql в Go', 'Пул соединений'],
      en: ['JOINs and subqueries', 'GROUP BY, HAVING, aggregation', 'CTEs and recursive queries', 'Window functions', 'Indexes: B-tree, composite, covering', 'Transactions and locks', 'EXPLAIN ANALYZE', 'N+1 problem', 'database/sql in Go', 'Connection pooling'],
    },
    quizId: 5,
    gridRow: 2,
    gridCol: 3,
    color: '#d2a679',
  },
  {
    blockId: 'concurrency',
    title: { ru: 'Конкурентность в Go', en: 'Go Concurrency' },
    subtitle: { ru: 'Каналы, sync, code review', en: 'Channels, sync, code review' },
    difficulty: 'intermediate' as const,
    topicCount: 50,
    topics: {
      ru: ['Горутины и планировщик GMP', 'Каналы: буферизованные и нет', 'select и паттерны на каналах', 'Pipeline, Fan-out/Fan-in', 'Семафор через канал', 'sync.Mutex и RWMutex', 'sync.WaitGroup, sync.Once', 'sync/atomic', 'sync.Pool', 'Data race и -race детектор', 'Goroutine leak и context.Context', 'errgroup', 'Паттерн Worker Pool'],
      en: ['Goroutines and GMP scheduler', 'Buffered and unbuffered channels', 'select and channel patterns', 'Pipeline, Fan-out/Fan-in', 'Semaphore via channel', 'sync.Mutex and RWMutex', 'sync.WaitGroup, sync.Once', 'sync/atomic', 'sync.Pool', 'Data race and -race detector', 'Goroutine leak and context.Context', 'errgroup', 'Worker Pool pattern'],
    },
    quizId: 3,
    gridRow: 3,
    gridCol: 1,
    color: '#d29922',
  },
  {
    blockId: 'networks',
    title: { ru: 'Сети и Линукс', en: 'Networks & Linux' },
    subtitle: { ru: 'TCP/IP, HTTP/2, TLS, epoll, процессы и сигналы', en: 'TCP/IP, HTTP/2, TLS, epoll, processes and signals' },
    difficulty: 'intermediate' as const,
    topicCount: 50,
    topics: {
      ru: ['TCP/IP: 3-way handshake, TIME_WAIT', 'HTTP/1.1 vs HTTP/2', 'TLS/HTTPS: сертификаты, mTLS', 'DNS и CDN', 'epoll/kqueue и netpoll в Go', 'Блокирующий vs неблокирующий I/O', 'Процесс vs поток vs горутина', 'Сигналы: SIGTERM, SIGINT', 'Linux CFS планировщик', 'mmap и файловые дескрипторы'],
      en: ['TCP/IP: 3-way handshake, TIME_WAIT', 'HTTP/1.1 vs HTTP/2', 'TLS/HTTPS: certificates, mTLS', 'DNS and CDN', 'epoll/kqueue and netpoll in Go', 'Blocking vs non-blocking I/O', 'Process vs thread vs goroutine', 'Signals: SIGTERM, SIGINT', 'Linux CFS scheduler', 'mmap and file descriptors'],
    },
    quizId: 6,
    gridRow: 3,
    gridCol: 3,
    color: '#a5d6ff',
  },
  {
    blockId: 'server',
    title: { ru: 'Работа с сервером в Go', en: 'Go Server Development' },
    subtitle: { ru: 'net/http, gRPC, graceful shutdown, логирование', en: 'net/http, gRPC, graceful shutdown, logging' },
    difficulty: 'intermediate-advanced' as const,
    topicCount: 45,
    topics: {
      ru: ['net/http: Handler, ServeMux, Middleware', 'gRPC и protobuf', 'WebSockets', 'Graceful shutdown с context + os/signal', 'Health checks и readiness probes', 'Structured logging: slog/zap/zerolog', 'Configuration management: viper, 12-factor', 'Dependency Injection в Go', 'Hexagonal Architecture', 'OpenTelemetry и трейсинг'],
      en: ['net/http: Handler, ServeMux, Middleware', 'gRPC and protobuf', 'WebSockets', 'Graceful shutdown with context + os/signal', 'Health checks and readiness probes', 'Structured logging: slog/zap/zerolog', 'Configuration management: viper, 12-factor', 'Dependency Injection in Go', 'Hexagonal Architecture', 'OpenTelemetry and tracing'],
    },
    quizId: null,
    gridRow: 4,
    gridCol: 2,
    color: '#3fb950',
  },
  {
    blockId: 'sysdesign',
    title: { ru: 'System Design Go', en: 'System Design in Go' },
    subtitle: { ru: 'Масштабирование, CAP, очереди, паттерны', en: 'Scaling, CAP, queues, patterns' },
    difficulty: 'advanced' as const,
    topicCount: 40,
    topics: {
      ru: ['Горизонтальное vs вертикальное масштабирование', 'CAP теорема', 'Consistent hashing', 'Rate limiting', 'Circuit breaker, Retry с backoff', 'Kafka / NATS / RabbitMQ', 'Saga pattern, 2PC', 'LRU Cache с TTL', 'URL Shortener', 'Pub/Sub система', 'Job Queue / Task Scheduler'],
      en: ['Horizontal vs vertical scaling', 'CAP theorem', 'Consistent hashing', 'Rate limiting', 'Circuit breaker, Retry with backoff', 'Kafka / NATS / RabbitMQ', 'Saga pattern, 2PC', 'LRU Cache with TTL', 'URL Shortener', 'Pub/Sub system', 'Job Queue / Task Scheduler'],
    },
    quizId: null,
    gridRow: 5,
    gridCol: 2,
    color: '#f85149',
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

type LegacyQuestion = {
  id: number
  question: string
  code?: string
  options: [string, string, string, string]
  correct: number
  explanation: string
}

function mapDifficulty(
  index: number,
  total: number,
): 'basic' | 'intermediate' | 'advanced' {
  const pct = index / total
  if (pct < 0.3) return 'basic'
  if (pct < 0.7) return 'intermediate'
  return 'advanced'
}

function buildQuestionDoc(
  q: LegacyQuestion,
  quizId: number,
  index: number,
  total: number,
) {
  const now = new Date()
  return {
    legacyId: q.id,
    type: 'mcq' as const,
    quizId,
    blockId: QUIZ_TO_BLOCK[quizId],
    question: q.question,
    ...(q.code ? { code: q.code } : {}),
    options: q.options,
    correct: q.correct as 0 | 1 | 2 | 3,
    explanation: q.explanation,
    difficulty: mapDifficulty(index, total),
    tags: [] as string[],
    createdAt: now,
    updatedAt: now,
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = new MongoClient(env.MONGODB_URI)
  await client.connect()
  const db = client.db(env.MONGODB_DB_NAME)

  const questionsCol = db.collection('questions')
  const blocksCol = db.collection('blocks')

  // ── Seed blocks ──────────────────────────────────────────────────────────────
  console.log('\n[seed] Seeding blocks...')
  let blockUpserts = 0
  for (const block of BLOCKS) {
    await blocksCol.updateOne(
      { blockId: block.blockId },
      {
        $set: { ...block, updatedAt: new Date() },
        $setOnInsert: { _id: new ObjectId(), createdAt: new Date() },
      },
      { upsert: true },
    )
    blockUpserts++
  }
  console.log(`[seed] ${blockUpserts} blocks upserted`)

  // ── Seed questions ────────────────────────────────────────────────────────────
  console.log('\n[seed] Seeding questions...')
  const batches: Array<{ quizId: number; qs: LegacyQuestion[] }> = [
    { quizId: 1, qs: questions as LegacyQuestion[] },
    { quizId: 2, qs: questions2 as LegacyQuestion[] },
    { quizId: 3, qs: questions3 as LegacyQuestion[] },
    { quizId: 4, qs: questionsOop as LegacyQuestion[] },
    { quizId: 5, qs: questionsSql as LegacyQuestion[] },
    { quizId: 6, qs: questionsNetworks as LegacyQuestion[] },
  ]

  let total = 0
  let inserted = 0
  let updated = 0

  for (const { quizId, qs } of batches) {
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i]!
      const doc = buildQuestionDoc(q, quizId, i, qs.length)

      const result = await questionsCol.updateOne(
        { legacyId: q.id, quizId },
        {
          $set: { ...doc, updatedAt: new Date() },
          $setOnInsert: { _id: new ObjectId() },
        },
        { upsert: true },
      )

      if (result.upsertedCount > 0) inserted++
      else if (result.modifiedCount > 0) updated++
      total++
    }
    console.log(`[seed] Quiz ${quizId}: ${qs.length} questions processed`)
  }

  console.log(`\n[seed] Done: ${total} total, ${inserted} inserted, ${updated} updated`)

  // ── Create indexes ─────────────────────────────────────────────────────────
  await questionsCol.createIndex({ quizId: 1 })
  await questionsCol.createIndex({ blockId: 1 })
  await questionsCol.createIndex({ legacyId: 1, quizId: 1 }, { unique: true })
  await blocksCol.createIndex({ blockId: 1 }, { unique: true })
  console.log('[seed] Indexes created')

  await client.close()
}

main().catch((err) => {
  console.error('[seed] Error:', err)
  process.exit(1)
})
