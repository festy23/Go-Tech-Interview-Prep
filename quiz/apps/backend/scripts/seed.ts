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
// We import the compiled JS from the frontend src or copy the data inline.
// Since we're in a monorepo, we can read directly from the frontend source.
import { questions } from '../../frontend/src/data/questions.js'
import { questions2 } from '../../frontend/src/data/questions2.js'
import { questions3 } from '../../frontend/src/data/questions3.js'
import { questionsOop } from '../../frontend/src/data/questions-oop.js'
import { questionsSql } from '../../frontend/src/data/questions-sql.js'

// ── Block mapping ─────────────────────────────────────────────────────────────
// quiz1 covers many topics → no single blockId
// quiz2 covers deep primitives/OOP → no single blockId
// quiz3 covers concurrency → blockId: "concurrency"
const QUIZ_TO_BLOCK: Record<number, string | null> = {
  1: null,
  2: null,
  3: 'concurrency',
  4: 'oop',
  5: 'sql',
}

// ── Block definitions (for seeding the blocks collection) ──────────────────────
const BLOCKS = [
  {
    blockId: 'primitives',
    title: 'Примитивы Go',
    difficulty: 'basic' as const,
    topicCount: 40,
    topics: [
      'Типы данных', 'Строки и руны', 'Константы и iota',
      'Указатели', 'Массивы и слайсы', 'Карты (map)',
      'Структуры и теги', 'Функции и замыкания', 'Пакеты и модули',
      'Видимость и init()', 'Дженерики (Go 1.18+)',
    ],
    quizId: null,
    gridRow: 1,
    gridCol: 2,
    color: '#58a6ff',
  },
  {
    blockId: 'oop',
    title: 'ООП в Go',
    difficulty: 'basic-intermediate' as const,
    topicCount: 50,
    topics: [
      'Методы и ресиверы', 'Интерфейсы — продвинутое',
      'Композиция и встраивание', 'Полиморфизм через интерфейсы',
      'SOLID-принципы в Go', 'Dependency Injection',
      'Стандартные интерфейсы', 'Паттерны проектирования',
    ],
    quizId: 4 as const,
    gridRow: 2,
    gridCol: 1,
    color: '#79c0ff',
  },
  {
    blockId: 'sql',
    title: 'SQL',
    difficulty: 'intermediate' as const,
    topicCount: 50,
    topics: [
      'JOINs и подзапросы', 'GROUP BY, HAVING, агрегация',
      'CTE и рекурсивные запросы', 'Оконные функции',
      'Индексы: B-tree, составные, покрывающие',
      'Транзакции и блокировки', 'EXPLAIN ANALYZE',
      'N+1 проблема', 'database/sql в Go', 'Пул соединений',
    ],
    quizId: 5 as const,
    gridRow: 2,
    gridCol: 3,
    color: '#d2a679',
  },
  {
    blockId: 'concurrency',
    title: 'Конкурентность в Go',
    difficulty: 'intermediate' as const,
    topicCount: 50,
    topics: [
      'Горутины и планировщик GMP', 'Каналы: буферизованные и нет',
      'select и паттерны на каналах', 'Pipeline, Fan-out/Fan-in',
      'Семафор через канал', 'sync.Mutex и RWMutex',
      'sync.WaitGroup, sync.Once', 'sync/atomic', 'sync.Pool',
      'Data race и -race детектор', 'Goroutine leak и context.Context',
      'errgroup', 'Паттерн Worker Pool',
    ],
    quizId: 3 as const,
    gridRow: 3,
    gridCol: 1,
    color: '#d29922',
  },
  {
    blockId: 'networks',
    title: 'Сети и Линукс',
    difficulty: 'intermediate' as const,
    topicCount: 35,
    topics: [
      'TCP/IP: 3-way handshake, TIME_WAIT', 'HTTP/1.1 vs HTTP/2',
      'TLS/HTTPS: сертификаты, mTLS', 'DNS и CDN',
      'epoll/kqueue и netpoll в Go', 'Блокирующий vs неблокирующий I/O',
      'Процесс vs поток vs горутина', 'Сигналы: SIGTERM, SIGINT',
      'Linux CFS планировщик', 'mmap и файловые дескрипторы',
    ],
    quizId: null,
    gridRow: 3,
    gridCol: 3,
    color: '#a5d6ff',
  },
  {
    blockId: 'server',
    title: 'Работа с сервером в Go',
    difficulty: 'intermediate-advanced' as const,
    topicCount: 45,
    topics: [
      'net/http: Handler, ServeMux, Middleware', 'gRPC и protobuf',
      'WebSockets', 'Graceful shutdown с context + os/signal',
      'Health checks и readiness probes', 'Structured logging: slog/zap/zerolog',
      'Configuration management: viper, 12-factor', 'Dependency Injection в Go',
      'Hexagonal Architecture', 'OpenTelemetry и трейсинг',
    ],
    quizId: null,
    gridRow: 4,
    gridCol: 2,
    color: '#3fb950',
  },
  {
    blockId: 'sysdesign',
    title: 'System Design Go',
    difficulty: 'advanced' as const,
    topicCount: 40,
    topics: [
      'Горизонтальное vs вертикальное масштабирование',
      'CAP теорема', 'Consistent hashing', 'Rate limiting',
      'Circuit breaker, Retry с backoff', 'Kafka / NATS / RabbitMQ',
      'Saga pattern, 2PC', 'LRU Cache с TTL', 'URL Shortener',
      'Pub/Sub система', 'Job Queue / Task Scheduler',
    ],
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
  quizId: 1 | 2 | 3 | 4 | 5,
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
  const batches: Array<{ quizId: 1 | 2 | 3 | 4 | 5; qs: LegacyQuestion[] }> = [
    { quizId: 1, qs: questions as LegacyQuestion[] },
    { quizId: 2, qs: questions2 as LegacyQuestion[] },
    { quizId: 3, qs: questions3 as LegacyQuestion[] },
    { quizId: 4, qs: questionsOop as LegacyQuestion[] },
    { quizId: 5, qs: questionsSql as LegacyQuestion[] },
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
