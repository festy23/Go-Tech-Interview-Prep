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
import { questionsServer } from '../../frontend/src/data/questions-server.js'

// ── Block mapping ─────────────────────────────────────────────────────────────
const QUIZ_TO_BLOCK: Record<number, string | null> = {
  1: null,
  2: null,
  3: 'concurrency',
  4: 'oop',
  5: 'sql',
  6: 'networks',
  7: 'server',
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
  // ── primitives sub-blocks ──────────────────────────────────────────────────
  {
    blockId: 'primitives-strings',
    parentBlockId: 'primitives',
    title: { ru: 'Строки и руны', en: 'Strings & Runes' },
    subtitle: { ru: 'string, rune, []byte, пакет strings', en: 'string, rune, []byte, strings package' },
    difficulty: 'basic' as const,
    topicCount: 20,
    topics: {
      ru: ['string и []byte', 'Руны и UTF-8', 'Пакет strings', 'strings.Builder', 'Преобразования'],
      en: ['string and []byte', 'Runes and UTF-8', 'strings package', 'strings.Builder', 'Conversions'],
    },
    quizId: null,
    gridRow: 0,
    gridCol: 0,
    color: '#58a6ff',
  },
  {
    blockId: 'primitives-maps',
    parentBlockId: 'primitives',
    title: { ru: 'Карты (map)', en: 'Maps' },
    subtitle: { ru: 'Создание, итерация, nil map, sync.Map', en: 'Creation, iteration, nil map, sync.Map' },
    difficulty: 'basic' as const,
    topicCount: 20,
    topics: {
      ru: ['Создание и инициализация', 'nil map', 'Итерация', 'Удаление ключей', 'Конкурентный доступ'],
      en: ['Creation and initialization', 'nil map', 'Iteration', 'Deleting keys', 'Concurrent access'],
    },
    quizId: null,
    gridRow: 0,
    gridCol: 0,
    color: '#58a6ff',
  },
  {
    blockId: 'primitives-slices',
    parentBlockId: 'primitives',
    title: { ru: 'Слайсы', en: 'Slices' },
    subtitle: { ru: 'len/cap, append, copy, underlying array', en: 'len/cap, append, copy, underlying array' },
    difficulty: 'basic' as const,
    topicCount: 20,
    topics: {
      ru: ['Структура слайса', 'append и capacity', 'copy', 'nil слайс', 'Срезы срезов'],
      en: ['Slice internals', 'append and capacity', 'copy', 'nil slice', 'Slices of slices'],
    },
    quizId: null,
    gridRow: 0,
    gridCol: 0,
    color: '#58a6ff',
  },
  {
    blockId: 'primitives-interfaces',
    parentBlockId: 'primitives',
    title: { ru: 'Интерфейсы', en: 'Interfaces' },
    subtitle: { ru: 'Определение, type assertion, nil интерфейс', en: 'Definition, type assertion, nil interface' },
    difficulty: 'basic-intermediate' as const,
    topicCount: 20,
    topics: {
      ru: ['Implicit implementation', 'Type assertion', 'Type switch', 'interface{} / any', 'nil интерфейс'],
      en: ['Implicit implementation', 'Type assertion', 'Type switch', 'interface{} / any', 'nil interface'],
    },
    quizId: null,
    gridRow: 0,
    gridCol: 0,
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
    quizId: null,
    gridRow: 2,
    gridCol: 1,
    color: '#79c0ff',
  },
  // ── oop sub-blocks ─────────────────────────────────────────────────────────
  {
    blockId: 'oop-solid',
    parentBlockId: 'oop',
    title: { ru: 'SOLID-принципы', en: 'SOLID Principles' },
    subtitle: { ru: 'SRP, OCP, LSP, ISP, DIP на примерах Go', en: 'SRP, OCP, LSP, ISP, DIP with Go examples' },
    difficulty: 'basic-intermediate' as const,
    topicCount: 20,
    topics: { ru: ['SRP', 'OCP', 'LSP', 'ISP', 'DIP'], en: ['SRP', 'OCP', 'LSP', 'ISP', 'DIP'] },
    quizId: null, gridRow: 0, gridCol: 0, color: '#79c0ff',
  },
  {
    blockId: 'oop-patterns',
    parentBlockId: 'oop',
    title: { ru: 'Паттерны проектирования', en: 'Design Patterns' },
    subtitle: { ru: 'Creational, Structural, Behavioral паттерны в Go', en: 'Creational, Structural, Behavioral patterns in Go' },
    difficulty: 'intermediate' as const,
    topicCount: 20,
    topics: { ru: ['Singleton', 'Factory', 'Decorator', 'Observer', 'Strategy'], en: ['Singleton', 'Factory', 'Decorator', 'Observer', 'Strategy'] },
    quizId: null, gridRow: 0, gridCol: 0, color: '#79c0ff',
  },
  {
    blockId: 'oop-embedding',
    parentBlockId: 'oop',
    title: { ru: 'Композиция и встраивание', en: 'Composition & Embedding' },
    subtitle: { ru: 'Методы, ресиверы, встраивание структур и интерфейсов', en: 'Methods, receivers, struct and interface embedding' },
    difficulty: 'basic-intermediate' as const,
    topicCount: 20,
    topics: { ru: ['Методы и ресиверы', 'Встраивание структур', 'Продвижение методов', 'Интерфейсы через встраивание'], en: ['Methods and receivers', 'Struct embedding', 'Method promotion', 'Interface embedding'] },
    quizId: null, gridRow: 0, gridCol: 0, color: '#79c0ff',
  },
  {
    blockId: 'oop-di',
    parentBlockId: 'oop',
    title: { ru: 'Dependency Injection', en: 'Dependency Injection' },
    subtitle: { ru: 'DI через интерфейсы, testability, wire/fx', en: 'DI via interfaces, testability, wire/fx' },
    difficulty: 'intermediate' as const,
    topicCount: 20,
    topics: { ru: ['DI через интерфейсы', 'Constructor injection', 'Тестируемость', 'Wire/Fx'], en: ['DI via interfaces', 'Constructor injection', 'Testability', 'Wire/Fx'] },
    quizId: null, gridRow: 0, gridCol: 0, color: '#79c0ff',
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
    quizId: null,
    gridRow: 2,
    gridCol: 3,
    color: '#d2a679',
  },
  // ── sql sub-blocks ─────────────────────────────────────────────────────────
  {
    blockId: 'sql-queries',
    parentBlockId: 'sql',
    title: { ru: 'Запросы SQL', en: 'SQL Queries' },
    subtitle: { ru: 'SELECT, JOIN, GROUP BY, CTE, оконные функции', en: 'SELECT, JOIN, GROUP BY, CTE, window functions' },
    difficulty: 'intermediate' as const,
    topicCount: 20,
    topics: { ru: ['SELECT и JOIN', 'GROUP BY и HAVING', 'CTE', 'Подзапросы', 'Оконные функции'], en: ['SELECT and JOIN', 'GROUP BY and HAVING', 'CTE', 'Subqueries', 'Window functions'] },
    quizId: null, gridRow: 0, gridCol: 0, color: '#d2a679',
  },
  {
    blockId: 'sql-indexes',
    parentBlockId: 'sql',
    title: { ru: 'Индексы', en: 'Indexes' },
    subtitle: { ru: 'B-tree, составные, покрывающие, EXPLAIN', en: 'B-tree, composite, covering, EXPLAIN' },
    difficulty: 'intermediate' as const,
    topicCount: 20,
    topics: { ru: ['B-tree', 'Составные индексы', 'Покрывающие индексы', 'EXPLAIN ANALYZE', 'N+1 проблема'], en: ['B-tree', 'Composite indexes', 'Covering indexes', 'EXPLAIN ANALYZE', 'N+1 problem'] },
    quizId: null, gridRow: 0, gridCol: 0, color: '#d2a679',
  },
  {
    blockId: 'sql-transactions',
    parentBlockId: 'sql',
    title: { ru: 'Транзакции', en: 'Transactions' },
    subtitle: { ru: 'ACID, уровни изоляции, блокировки, deadlock', en: 'ACID, isolation levels, locks, deadlock' },
    difficulty: 'intermediate' as const,
    topicCount: 20,
    topics: { ru: ['ACID', 'Уровни изоляции', 'Блокировки', 'Deadlock', 'MVCC'], en: ['ACID', 'Isolation levels', 'Locks', 'Deadlock', 'MVCC'] },
    quizId: null, gridRow: 0, gridCol: 0, color: '#d2a679',
  },
  {
    blockId: 'sql-go-driver',
    parentBlockId: 'sql',
    title: { ru: 'database/sql в Go', en: 'database/sql in Go' },
    subtitle: { ru: 'sql.Open, Query, Scan, Exec, пул соединений', en: 'sql.Open, Query, Scan, Exec, connection pool' },
    difficulty: 'intermediate' as const,
    topicCount: 20,
    topics: { ru: ['sql.Open', 'Query и QueryRow', 'Exec', 'Prepared statements', 'Пул соединений'], en: ['sql.Open', 'Query and QueryRow', 'Exec', 'Prepared statements', 'Connection pool'] },
    quizId: null, gridRow: 0, gridCol: 0, color: '#d2a679',
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
    quizId: null,
    gridRow: 3,
    gridCol: 1,
    color: '#d29922',
  },
  // ── concurrency sub-blocks ─────────────────────────────────────────────────
  {
    blockId: 'concurrency-goroutines',
    parentBlockId: 'concurrency',
    title: { ru: 'Горутины', en: 'Goroutines' },
    subtitle: { ru: 'go keyword, стек, планировщик GMP, утечки', en: 'go keyword, stack, GMP scheduler, leaks' },
    difficulty: 'intermediate' as const,
    topicCount: 20,
    topics: { ru: ['go keyword', 'Стек горутины', 'GMP планировщик', 'GOMAXPROCS', 'Утечки горутин'], en: ['go keyword', 'Goroutine stack', 'GMP scheduler', 'GOMAXPROCS', 'Goroutine leaks'] },
    quizId: null, gridRow: 0, gridCol: 0, color: '#d29922',
  },
  {
    blockId: 'concurrency-channels',
    parentBlockId: 'concurrency',
    title: { ru: 'Каналы', en: 'Channels' },
    subtitle: { ru: 'Буферизованные, select, направление, close', en: 'Buffered, select, direction, close' },
    difficulty: 'intermediate' as const,
    topicCount: 20,
    topics: { ru: ['Буферизованные каналы', 'Небуферизованные каналы', 'select', 'close и range', 'Направление каналов'], en: ['Buffered channels', 'Unbuffered channels', 'select', 'close and range', 'Channel direction'] },
    quizId: null, gridRow: 0, gridCol: 0, color: '#d29922',
  },
  {
    blockId: 'concurrency-sync',
    parentBlockId: 'concurrency',
    title: { ru: 'Пакет sync', en: 'sync Package' },
    subtitle: { ru: 'Mutex, RWMutex, Once, Pool, atomic', en: 'Mutex, RWMutex, Once, Pool, atomic' },
    difficulty: 'intermediate' as const,
    topicCount: 20,
    topics: { ru: ['sync.Mutex', 'sync.RWMutex', 'sync.Once', 'sync.Pool', 'sync/atomic'], en: ['sync.Mutex', 'sync.RWMutex', 'sync.Once', 'sync.Pool', 'sync/atomic'] },
    quizId: null, gridRow: 0, gridCol: 0, color: '#d29922',
  },
  {
    blockId: 'concurrency-context',
    parentBlockId: 'concurrency',
    title: { ru: 'Context', en: 'Context' },
    subtitle: { ru: 'WithCancel, WithTimeout, Value, propagation', en: 'WithCancel, WithTimeout, Value, propagation' },
    difficulty: 'intermediate' as const,
    topicCount: 20,
    topics: { ru: ['context.Background', 'WithCancel', 'WithTimeout', 'WithValue', 'Propagation'], en: ['context.Background', 'WithCancel', 'WithTimeout', 'WithValue', 'Propagation'] },
    quizId: null, gridRow: 0, gridCol: 0, color: '#d29922',
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
    quizId: 7,
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

type BilingualQuestion = {
  type: 'mcq'
  blockId: string
  quizId: null
  question: { ru: string; en: string }
  code?: string
  options: { ru: [string, string, string, string]; en: [string, string, string, string] }
  correct: 0 | 1 | 2 | 3
  explanation: { ru: string; en: string }
  difficulty: 'basic' | 'basic-intermediate' | 'intermediate' | 'intermediate-advanced' | 'advanced'
  tags: string[]
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

// ── Primitives: Strings & Runes (20 questions) ──────────────────────────────
const questionsPrimitivesStrings: BilingualQuestion[] = [
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Какое нулевое значение (zero value) у типа string в Go?', en: 'What is the zero value of the string type in Go?' },
    options: {
      ru: ['Пустая строка ""', 'nil', '"nil"', 'undefined'],
      en: ['Empty string ""', 'nil', '"nil"', 'undefined'],
    },
    correct: 0 as const,
    explanation: { ru: 'Нулевое значение строки в Go — пустая строка "".', en: 'The zero value of a string in Go is the empty string "".' },
    difficulty: 'basic' as const,
    tags: ['strings', 'zero-value'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Что возвращает len("Привет") в Go?', en: 'What does len("Привет") return in Go?' },
    options: {
      ru: ['12', '6', '7', '24'],
      en: ['12', '6', '7', '24'],
    },
    correct: 0 as const,
    explanation: { ru: 'len() возвращает количество байтов, а не рун. Каждая кириллическая буква занимает 2 байта в UTF-8, поэтому 6 × 2 = 12.', en: 'len() returns the number of bytes, not runes. Each Cyrillic character takes 2 bytes in UTF-8, so 6 × 2 = 12.' },
    difficulty: 'basic' as const,
    tags: ['strings', 'len', 'utf-8'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Как правильно итерировать по рунам строки в Go?', en: 'How do you correctly iterate over runes in a Go string?' },
    options: {
      ru: ['for i, r := range s', 'for i := 0; i < len(s); i++ с s[i]', 'for r := range []rune(s)', 'strings.Each(s, func(r rune))'],
      en: ['for i, r := range s', 'for i := 0; i < len(s); i++ with s[i]', 'for r := range []rune(s)', 'strings.Each(s, func(r rune))'],
    },
    correct: 0 as const,
    explanation: { ru: 'range по строке автоматически декодирует UTF-8 и возвращает руны.', en: 'range over a string automatically decodes UTF-8 and yields runes.' },
    difficulty: 'basic' as const,
    tags: ['strings', 'range', 'runes'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Что возвращает выражение s[0] для строки s := "Hello"?', en: 'What does the expression s[0] return for string s := "Hello"?' },
    options: {
      ru: ['Байт (byte) со значением 72', 'Руну \'H\'', 'Строку "H"', 'Ошибку компиляции'],
      en: ['A byte with value 72', 'The rune \'H\'', 'The string "H"', 'A compilation error'],
    },
    correct: 0 as const,
    explanation: { ru: 'Индексирование строки возвращает байт (тип byte/uint8), а не руну.', en: 'Indexing a string returns a byte (type byte/uint8), not a rune.' },
    difficulty: 'basic' as const,
    tags: ['strings', 'indexing', 'byte'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Что выведет fmt.Println(string(65))?', en: 'What does fmt.Println(string(65)) print?' },
    options: {
      ru: ['"A"', '"65"', 'Ошибку компиляции', '"6"'],
      en: ['"A"', '"65"', 'A compilation error', '"6"'],
    },
    correct: 0 as const,
    explanation: { ru: 'string(65) преобразует число в руну с кодом 65 (буква "A" в ASCII/Unicode).', en: 'string(65) converts the number to a rune with code point 65 (the letter "A" in ASCII/Unicode).' },
    difficulty: 'basic' as const,
    tags: ['strings', 'conversion', 'rune'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Какой тип рекомендуется для эффективной конкатенации множества строк?', en: 'Which type is recommended for efficient concatenation of many strings?' },
    options: {
      ru: ['strings.Builder', 'Оператор + в цикле', 'fmt.Sprintf', 'bytes.Reader'],
      en: ['strings.Builder', 'The + operator in a loop', 'fmt.Sprintf', 'bytes.Reader'],
    },
    correct: 0 as const,
    explanation: { ru: 'strings.Builder минимизирует аллокации при конкатенации, в отличие от оператора +, который создаёт новую строку на каждой итерации.', en: 'strings.Builder minimizes allocations during concatenation, unlike the + operator which creates a new string on each iteration.' },
    difficulty: 'basic' as const,
    tags: ['strings', 'strings.Builder', 'performance'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Что происходит при преобразовании []byte(s) строки?', en: 'What happens when you convert a string with []byte(s)?' },
    options: {
      ru: ['Создаётся копия байтов строки', 'Возвращается указатель на те же данные', 'Строка становится мутабельной', 'Компилятор выдаёт ошибку'],
      en: ['A copy of the string bytes is created', 'A pointer to the same data is returned', 'The string becomes mutable', 'The compiler raises an error'],
    },
    correct: 0 as const,
    explanation: { ru: '[]byte(s) создаёт копию данных строки. Модификация полученного слайса не изменяет оригинальную строку.', en: '[]byte(s) creates a copy of the string data. Modifying the resulting slice does not change the original string.' },
    difficulty: 'basic' as const,
    tags: ['strings', 'byte-slice', 'conversion'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Какая функция проверяет, содержит ли строка подстроку?', en: 'Which function checks if a string contains a substring?' },
    options: {
      ru: ['strings.Contains(s, substr)', 's.Contains(substr)', 'strings.Has(s, substr)', 'strings.Includes(s, substr)'],
      en: ['strings.Contains(s, substr)', 's.Contains(substr)', 'strings.Has(s, substr)', 'strings.Includes(s, substr)'],
    },
    correct: 0 as const,
    explanation: { ru: 'strings.Contains — стандартная функция для проверки наличия подстроки.', en: 'strings.Contains is the standard function for checking substring presence.' },
    difficulty: 'basic' as const,
    tags: ['strings', 'strings-package'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Что такое rune в Go?', en: 'What is rune in Go?' },
    options: {
      ru: ['Псевдоним (alias) для int32', 'Псевдоним для byte', 'Отдельный тип для символов', 'Псевдоним для uint32'],
      en: ['An alias for int32', 'An alias for byte', 'A separate type for characters', 'An alias for uint32'],
    },
    correct: 0 as const,
    explanation: { ru: 'rune — это псевдоним для int32, представляющий кодовую точку Unicode.', en: 'rune is an alias for int32, representing a Unicode code point.' },
    difficulty: 'basic' as const,
    tags: ['strings', 'rune', 'types'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Как получить количество рун в строке?', en: 'How do you get the number of runes in a string?' },
    options: {
      ru: ['utf8.RuneCountInString(s)', 'len(s)', 'strings.RuneCount(s)', 'unicode.Count(s)'],
      en: ['utf8.RuneCountInString(s)', 'len(s)', 'strings.RuneCount(s)', 'unicode.Count(s)'],
    },
    correct: 0 as const,
    explanation: { ru: 'utf8.RuneCountInString возвращает количество рун (символов Unicode) в строке, в отличие от len(), который считает байты.', en: 'utf8.RuneCountInString returns the number of runes (Unicode characters) in a string, unlike len() which counts bytes.' },
    difficulty: 'basic' as const,
    tags: ['strings', 'utf-8', 'rune-count'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Строки в Go являются...', en: 'Strings in Go are...' },
    options: {
      ru: ['Неизменяемыми последовательностями байтов', 'Изменяемыми последовательностями рун', 'Указателями на массив рун', 'Неизменяемыми последовательностями рун'],
      en: ['Immutable sequences of bytes', 'Mutable sequences of runes', 'Pointers to rune arrays', 'Immutable sequences of runes'],
    },
    correct: 0 as const,
    explanation: { ru: 'Строки в Go — неизменяемые последовательности байтов. Внутренне они хранят UTF-8, но тип — именно байтовая последовательность.', en: 'Strings in Go are immutable sequences of bytes. Internally they store UTF-8, but the type is a byte sequence.' },
    difficulty: 'basic' as const,
    tags: ['strings', 'immutability'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Какая функция разбивает строку по разделителю?', en: 'Which function splits a string by a delimiter?' },
    options: {
      ru: ['strings.Split(s, sep)', 'strings.Divide(s, sep)', 's.Split(sep)', 'strings.Tokenize(s, sep)'],
      en: ['strings.Split(s, sep)', 'strings.Divide(s, sep)', 's.Split(sep)', 'strings.Tokenize(s, sep)'],
    },
    correct: 0 as const,
    explanation: { ru: 'strings.Split разбивает строку по указанному разделителю и возвращает []string.', en: 'strings.Split splits a string by the given delimiter and returns []string.' },
    difficulty: 'basic' as const,
    tags: ['strings', 'strings-package', 'split'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Чем strings.Replace отличается от strings.ReplaceAll?', en: 'What is the difference between strings.Replace and strings.ReplaceAll?' },
    options: {
      ru: ['Replace принимает параметр n (кол-во замен), ReplaceAll заменяет все', 'Replace работает с regexp, ReplaceAll — без', 'Нет разницы, это синонимы', 'ReplaceAll работает быстрее'],
      en: ['Replace takes a parameter n (number of replacements), ReplaceAll replaces all', 'Replace works with regexp, ReplaceAll does not', 'No difference, they are synonyms', 'ReplaceAll is faster'],
    },
    correct: 0 as const,
    explanation: { ru: 'strings.Replace(s, old, new, n) заменяет первые n вхождений. strings.ReplaceAll эквивалентен Replace с n = -1.', en: 'strings.Replace(s, old, new, n) replaces the first n occurrences. strings.ReplaceAll is equivalent to Replace with n = -1.' },
    difficulty: 'basic' as const,
    tags: ['strings', 'strings-package', 'replace'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Какие кавычки используются для raw string literals в Go?', en: 'Which quotes are used for raw string literals in Go?' },
    options: {
      ru: ['Обратные кавычки (backticks) `...`', 'Одинарные кавычки \'...\'', 'Тройные двойные кавычки """..."""', 'Двойные кавычки "..."'],
      en: ['Backticks `...`', 'Single quotes \'...\'', 'Triple double quotes """..."""', 'Double quotes "..."'],
    },
    correct: 0 as const,
    explanation: { ru: 'Raw string literals в Go заключаются в обратные кавычки. В них не обрабатываются escape-последовательности.', en: 'Raw string literals in Go are enclosed in backticks. Escape sequences are not processed inside them.' },
    difficulty: 'basic' as const,
    tags: ['strings', 'raw-string', 'syntax'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Срез строки s[2:5] возвращает...', en: 'The string slice s[2:5] returns...' },
    options: {
      ru: ['Подстроку на основе байтовых индексов', 'Подстроку на основе индексов рун', 'Срез рун', 'Ошибку, строки не поддерживают срезы'],
      en: ['A substring based on byte indices', 'A substring based on rune indices', 'A slice of runes', 'An error — strings do not support slicing'],
    },
    correct: 0 as const,
    explanation: { ru: 'Срезы строк работают по байтовым индексам. Для многобайтовых символов это может привести к невалидным UTF-8 последовательностям.', en: 'String slicing works on byte indices. For multi-byte characters, this can result in invalid UTF-8 sequences.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['strings', 'slicing', 'bytes'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Изменится ли строка s после выполнения b := []byte(s); b[0] = \'X\'?', en: 'Will string s change after executing b := []byte(s); b[0] = \'X\'?' },
    options: {
      ru: ['Нет, []byte(s) создаёт копию', 'Да, b ссылается на те же данные', 'Будет panic', 'Ошибка компиляции'],
      en: ['No, []byte(s) creates a copy', 'Yes, b references the same data', 'It will panic', 'Compilation error'],
    },
    correct: 0 as const,
    explanation: { ru: '[]byte(s) создаёт копию данных. Изменение копии не влияет на оригинальную строку, которая иммутабельна.', en: '[]byte(s) creates a copy of the data. Modifying the copy does not affect the original string, which is immutable.' },
    difficulty: 'basic' as const,
    tags: ['strings', 'byte-slice', 'immutability'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Какая функция удаляет пробелы в начале и конце строки?', en: 'Which function removes whitespace from the beginning and end of a string?' },
    options: {
      ru: ['strings.TrimSpace(s)', 'strings.Trim(s)', 'strings.Strip(s)', 's.TrimSpace()'],
      en: ['strings.TrimSpace(s)', 'strings.Trim(s)', 'strings.Strip(s)', 's.TrimSpace()'],
    },
    correct: 0 as const,
    explanation: { ru: 'strings.TrimSpace удаляет пробельные символы (пробел, табуляция, перенос строки и т.д.) с обоих концов строки.', en: 'strings.TrimSpace removes whitespace characters (space, tab, newline, etc.) from both ends of the string.' },
    difficulty: 'basic' as const,
    tags: ['strings', 'strings-package', 'trim'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Как правильно преобразовать число 42 в строку "42"?', en: 'How do you correctly convert the number 42 to the string "42"?' },
    options: {
      ru: ['strconv.Itoa(42)', 'string(42)', 'fmt.String(42)', 'strings.FromInt(42)'],
      en: ['strconv.Itoa(42)', 'string(42)', 'fmt.String(42)', 'strings.FromInt(42)'],
    },
    correct: 0 as const,
    explanation: { ru: 'strconv.Itoa преобразует int в строковое представление числа. string(42) вернёт символ с кодом 42 ("*"), а не "42".', en: 'strconv.Itoa converts an int to its string representation. string(42) returns the character with code point 42 ("*"), not "42".' },
    difficulty: 'basic' as const,
    tags: ['strings', 'strconv', 'conversion'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'В чём преимущество strings.Builder перед bytes.Buffer для построения строк?', en: 'What is the advantage of strings.Builder over bytes.Buffer for building strings?' },
    options: {
      ru: ['Builder.String() не копирует данные', 'Builder поддерживает io.Writer', 'Builder потокобезопасен', 'Builder быстрее при записи байтов'],
      en: ['Builder.String() does not copy data', 'Builder supports io.Writer', 'Builder is thread-safe', 'Builder is faster when writing bytes'],
    },
    correct: 0 as const,
    explanation: { ru: 'strings.Builder.String() возвращает строку без копирования внутреннего буфера, в отличие от bytes.Buffer.String().', en: 'strings.Builder.String() returns a string without copying the internal buffer, unlike bytes.Buffer.String().' },
    difficulty: 'basic-intermediate' as const,
    tags: ['strings', 'strings.Builder', 'bytes.Buffer'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-strings', quizId: null,
    question: { ru: 'Какой размер в байтах занимает символ "世" в UTF-8?', en: 'How many bytes does the character "世" take in UTF-8?' },
    options: {
      ru: ['3 байта', '2 байта', '4 байта', '1 байт'],
      en: ['3 bytes', '2 bytes', '4 bytes', '1 byte'],
    },
    correct: 0 as const,
    explanation: { ru: 'Китайские иероглифы в UTF-8 занимают 3 байта. Диапазон U+0800..U+FFFF кодируется тремя байтами.', en: 'Chinese characters take 3 bytes in UTF-8. The range U+0800..U+FFFF is encoded with three bytes.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['strings', 'utf-8', 'multi-byte'],
  },
]

// ── Primitives: Maps (20 questions) ─────────────────────────────────────────
const questionsPrimitivesMaps: BilingualQuestion[] = [
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Какое нулевое значение (zero value) у типа map в Go?', en: 'What is the zero value of a map type in Go?' },
    options: {
      ru: ['nil', 'Пустая карта map[]', '{}', 'undefined'],
      en: ['nil', 'Empty map map[]', '{}', 'undefined'],
    },
    correct: 0 as const,
    explanation: { ru: 'Нулевое значение map — nil. nil map можно читать (возвращает zero value), но запись вызовет panic.', en: 'The zero value of a map is nil. You can read from a nil map (returns zero value), but writing causes a panic.' },
    difficulty: 'basic' as const,
    tags: ['maps', 'zero-value', 'nil'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Что произойдёт при записи в nil map?', en: 'What happens when you write to a nil map?' },
    options: {
      ru: ['panic: assignment to entry in nil map', 'Значение будет записано', 'Карта автоматически инициализируется', 'Ошибка компиляции'],
      en: ['panic: assignment to entry in nil map', 'The value will be written', 'The map is automatically initialized', 'Compilation error'],
    },
    correct: 0 as const,
    explanation: { ru: 'Запись в nil map вызывает runtime panic. Перед записью карту нужно инициализировать через make() или литерал.', en: 'Writing to a nil map causes a runtime panic. The map must be initialized with make() or a literal before writing.' },
    difficulty: 'basic' as const,
    tags: ['maps', 'nil', 'panic'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'В чём разница между make(map[string]int) и map[string]int{}?', en: 'What is the difference between make(map[string]int) and map[string]int{}?' },
    options: {
      ru: ['Оба создают пустую инициализированную карту', 'make создаёт nil map', 'Литерал {} создаёт nil map', 'make выделяет больше памяти'],
      en: ['Both create an empty initialized map', 'make creates a nil map', 'The {} literal creates a nil map', 'make allocates more memory'],
    },
    correct: 0 as const,
    explanation: { ru: 'Оба способа создают пустую, готовую к использованию карту. make позволяет указать hint по размеру, литерал — нет.', en: 'Both create an empty, ready-to-use map. make allows specifying a size hint, the literal does not.' },
    difficulty: 'basic' as const,
    tags: ['maps', 'initialization', 'make'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Как безопасно проверить наличие ключа в map?', en: 'How do you safely check if a key exists in a map?' },
    options: {
      ru: ['v, ok := m[key]; if ok { ... }', 'if m.Has(key) { ... }', 'if m[key] != nil { ... }', 'if _, err := m[key]; err == nil { ... }'],
      en: ['v, ok := m[key]; if ok { ... }', 'if m.Has(key) { ... }', 'if m[key] != nil { ... }', 'if _, err := m[key]; err == nil { ... }'],
    },
    correct: 0 as const,
    explanation: { ru: 'Идиома «comma ok» — v, ok := m[key] — стандартный способ проверки наличия ключа в карте.', en: 'The "comma ok" idiom — v, ok := m[key] — is the standard way to check for key existence in a map.' },
    difficulty: 'basic' as const,
    tags: ['maps', 'comma-ok', 'idiom'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Гарантирован ли порядок итерации по map в Go?', en: 'Is the iteration order over a map guaranteed in Go?' },
    options: {
      ru: ['Нет, порядок итерации случайный', 'Да, в порядке вставки', 'Да, в алфавитном порядке ключей', 'Да, в порядке хеширования'],
      en: ['No, iteration order is random', 'Yes, in insertion order', 'Yes, in alphabetical order of keys', 'Yes, in hash order'],
    },
    correct: 0 as const,
    explanation: { ru: 'Go намеренно рандомизирует порядок итерации по map, чтобы программисты не полагались на конкретный порядок.', en: 'Go intentionally randomizes map iteration order so programmers do not rely on a specific order.' },
    difficulty: 'basic' as const,
    tags: ['maps', 'iteration', 'order'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Как удалить ключ из map?', en: 'How do you delete a key from a map?' },
    options: {
      ru: ['delete(m, key)', 'm.Remove(key)', 'm.Delete(key)', 'unset(m[key])'],
      en: ['delete(m, key)', 'm.Remove(key)', 'm.Delete(key)', 'unset(m[key])'],
    },
    correct: 0 as const,
    explanation: { ru: 'Встроенная функция delete(m, key) удаляет ключ из карты. Если ключа нет, ничего не происходит.', en: 'The built-in function delete(m, key) removes a key from the map. If the key does not exist, nothing happens.' },
    difficulty: 'basic' as const,
    tags: ['maps', 'delete'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Как получить количество элементов в map?', en: 'How do you get the number of elements in a map?' },
    options: {
      ru: ['len(m)', 'm.Size()', 'cap(m)', 'm.Len()'],
      en: ['len(m)', 'm.Size()', 'cap(m)', 'm.Len()'],
    },
    correct: 0 as const,
    explanation: { ru: 'Встроенная функция len() возвращает количество элементов в карте. cap() для map не определена.', en: 'The built-in function len() returns the number of elements in a map. cap() is not defined for maps.' },
    difficulty: 'basic' as const,
    tags: ['maps', 'len'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Что произойдёт, если передать map в функцию и изменить его внутри?', en: 'What happens if you pass a map to a function and modify it inside?' },
    options: {
      ru: ['Изменения будут видны вызывающему коду', 'Функция получит копию карты', 'Будет ошибка компиляции', 'Будет panic'],
      en: ['Changes will be visible to the caller', 'The function receives a copy of the map', 'There will be a compilation error', 'It will panic'],
    },
    correct: 0 as const,
    explanation: { ru: 'Map — ссылочный тип. При передаче в функцию копируется только заголовок, данные остаются общими.', en: 'Maps are reference types. When passed to a function, only the header is copied — the data is shared.' },
    difficulty: 'basic' as const,
    tags: ['maps', 'reference-type', 'functions'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Как объявить вложенную карту map[string]map[string]int?', en: 'How do you declare a nested map map[string]map[string]int?' },
    options: {
      ru: ['Нужно инициализировать каждую внутреннюю карту отдельно', 'make автоматически создаёт внутренние карты', 'Вложенные карты не поддерживаются', 'Используется ключевое слово nested'],
      en: ['Each inner map must be initialized separately', 'make automatically creates inner maps', 'Nested maps are not supported', 'The nested keyword is used'],
    },
    correct: 0 as const,
    explanation: { ru: 'При работе с вложенными картами каждую внутреннюю карту нужно инициализировать через make или литерал перед записью.', en: 'When working with nested maps, each inner map must be initialized via make or a literal before writing.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['maps', 'nested', 'initialization'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Можно ли сравнивать два map оператором ==?', en: 'Can you compare two maps with the == operator?' },
    options: {
      ru: ['Нет, == можно использовать только для сравнения с nil', 'Да, сравнение поэлементное', 'Да, по указателю', 'Нет, даже с nil нельзя'],
      en: ['No, == can only be used to compare with nil', 'Yes, element-by-element comparison', 'Yes, by pointer', 'No, not even with nil'],
    },
    correct: 0 as const,
    explanation: { ru: 'Карты нельзя сравнивать друг с другом через ==. Можно сравнить только с nil. Для поэлементного сравнения используйте maps.Equal (Go 1.21+).', en: 'Maps cannot be compared with each other via ==. You can only compare with nil. For element-wise comparison use maps.Equal (Go 1.21+).' },
    difficulty: 'basic' as const,
    tags: ['maps', 'comparison'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Для чего используется sync.Map?', en: 'What is sync.Map used for?' },
    options: {
      ru: ['Для конкурентного безопасного доступа к карте из нескольких горутин', 'Для сортировки карты', 'Для синхронизации данных с диском', 'Для создания иммутабельной карты'],
      en: ['For concurrent-safe map access from multiple goroutines', 'For sorting a map', 'For syncing data to disk', 'For creating an immutable map'],
    },
    correct: 0 as const,
    explanation: { ru: 'sync.Map оптимизирован для сценариев, где ключи стабильны (read-heavy) или каждая горутина пишет в свои ключи.', en: 'sync.Map is optimized for scenarios where keys are stable (read-heavy) or each goroutine writes to its own keys.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['maps', 'sync.Map', 'concurrency'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Как использовать map в качестве множества (set)?', en: 'How do you use a map as a set?' },
    options: {
      ru: ['map[string]struct{} — значение struct{} не занимает память', 'map[string]bool — true для каждого элемента', 'map[string]nil', 'set[string] — встроенный тип'],
      en: ['map[string]struct{} — struct{} value takes no memory', 'map[string]bool — true for each element', 'map[string]nil', 'set[string] — built-in type'],
    },
    correct: 0 as const,
    explanation: { ru: 'map[string]struct{} — идиоматичный способ реализации множества в Go. struct{} не занимает памяти (0 байт).', en: 'map[string]struct{} is the idiomatic way to implement a set in Go. struct{} takes zero memory (0 bytes).' },
    difficulty: 'basic' as const,
    tags: ['maps', 'set', 'idiom'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Как скопировать map в Go?', en: 'How do you copy a map in Go?' },
    options: {
      ru: ['Вручную перебрать все ключи и скопировать значения', 'copy(dst, src)', 'm2 := m1', 'maps.Copy(dst, src) копирует автоматически без ручного цикла (Go 1.21+)'],
      en: ['Manually iterate over all keys and copy values', 'copy(dst, src)', 'm2 := m1', 'maps.Copy(dst, src) copies automatically without manual loop (Go 1.21+)'],
    },
    correct: 0 as const,
    explanation: { ru: 'В Go нет встроенного способа скопировать map одной операцией до Go 1.21. Нужно вручную перебирать ключи. В Go 1.21+ есть maps.Clone/maps.Copy.', en: 'Before Go 1.21 there is no built-in way to copy a map in one operation. You must manually iterate over keys. Go 1.21+ has maps.Clone/maps.Copy.' },
    difficulty: 'basic' as const,
    tags: ['maps', 'copy'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Какие типы НЕ могут быть ключами map?', en: 'Which types CANNOT be map keys?' },
    options: {
      ru: ['Слайсы, карты и функции', 'Строки и числа', 'Структуры и массивы', 'Указатели и интерфейсы'],
      en: ['Slices, maps, and functions', 'Strings and numbers', 'Structs and arrays', 'Pointers and interfaces'],
    },
    correct: 0 as const,
    explanation: { ru: 'Ключи map должны быть сравниваемыми (comparable). Слайсы, карты и функции не являются comparable, поэтому не могут быть ключами.', en: 'Map keys must be comparable. Slices, maps, and functions are not comparable, so they cannot be used as keys.' },
    difficulty: 'basic' as const,
    tags: ['maps', 'keys', 'comparable'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Что возвращает обращение к несуществующему ключу m["absent"]?', en: 'What does accessing a non-existent key m["absent"] return?' },
    options: {
      ru: ['Нулевое значение типа значения', 'nil', 'panic', 'Ошибку'],
      en: ['The zero value of the value type', 'nil', 'panic', 'An error'],
    },
    correct: 0 as const,
    explanation: { ru: 'Обращение к несуществующему ключу возвращает нулевое значение типа значения карты (0 для int, "" для string и т.д.).', en: 'Accessing a non-existent key returns the zero value of the map value type (0 for int, "" for string, etc.).' },
    difficulty: 'basic' as const,
    tags: ['maps', 'zero-value', 'absent-key'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Как Go кодирует map в JSON?', en: 'How does Go encode a map to JSON?' },
    options: {
      ru: ['Ключи сортируются по алфавиту в результирующем JSON', 'Ключи идут в порядке вставки', 'Порядок случайный, как при итерации', 'JSON-кодирование map не поддерживается'],
      en: ['Keys are sorted alphabetically in the resulting JSON', 'Keys follow insertion order', 'Order is random, as during iteration', 'JSON encoding of maps is not supported'],
    },
    correct: 0 as const,
    explanation: { ru: 'encoding/json сортирует строковые ключи карты по алфавиту при маршалинге.', en: 'encoding/json sorts string map keys alphabetically during marshaling.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['maps', 'json', 'encoding'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Как инициализировать map с начальными значениями?', en: 'How do you initialize a map with initial values?' },
    options: {
      ru: ['m := map[string]int{"a": 1, "b": 2}', 'm := make(map[string]int, {"a": 1})', 'm := new(map[string]int){"a": 1}', 'm := map[string]int.Init("a", 1)'],
      en: ['m := map[string]int{"a": 1, "b": 2}', 'm := make(map[string]int, {"a": 1})', 'm := new(map[string]int){"a": 1}', 'm := map[string]int.Init("a", 1)'],
    },
    correct: 0 as const,
    explanation: { ru: 'Литерал карты позволяет инициализировать map с начальными парами ключ-значение.', en: 'A map literal allows initializing a map with initial key-value pairs.' },
    difficulty: 'basic' as const,
    tags: ['maps', 'literal', 'initialization'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Зачем указывать hint в make(map[string]int, 100)?', en: 'Why specify a hint in make(map[string]int, 100)?' },
    options: {
      ru: ['Чтобы предварительно выделить память и уменьшить rehash', 'Чтобы ограничить максимальный размер карты', 'Чтобы задать capacity (как у слайсов)', 'Hint не имеет эффекта, это устаревшая функция'],
      en: ['To pre-allocate memory and reduce rehashing', 'To limit the maximum map size', 'To set capacity (like slices)', 'Hint has no effect, it is a deprecated feature'],
    },
    correct: 0 as const,
    explanation: { ru: 'Hint позволяет Go предварительно выделить hash-таблицу нужного размера, уменьшая количество расширений при заполнении.', en: 'The hint lets Go pre-allocate a hash table of the appropriate size, reducing the number of grow operations during filling.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['maps', 'make', 'performance'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Что произойдёт при одновременном чтении и записи в map из разных горутин?', en: 'What happens when reading and writing to a map concurrently from different goroutines?' },
    options: {
      ru: ['fatal error: concurrent map read and map write', 'Данные просто будут неконсистентны', 'Go автоматически синхронизирует доступ', 'Ошибка компиляции'],
      en: ['fatal error: concurrent map read and map write', 'Data will just be inconsistent', 'Go automatically synchronizes access', 'Compilation error'],
    },
    correct: 0 as const,
    explanation: { ru: 'Go runtime обнаруживает конкурентное чтение/запись в map и вызывает fatal error (не recoverable panic).', en: 'The Go runtime detects concurrent map read/write and triggers a fatal error (not a recoverable panic).' },
    difficulty: 'basic-intermediate' as const,
    tags: ['maps', 'concurrency', 'data-race'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-maps', quizId: null,
    question: { ru: 'Какие функции появились в пакете maps в Go 1.21+?', en: 'Which functions were added in the maps package in Go 1.21+?' },
    options: {
      ru: ['maps.Keys, maps.Values, maps.Clone', 'maps.Sort, maps.Filter', 'maps.Merge, maps.Intersect', 'maps.Lock, maps.Unlock'],
      en: ['maps.Keys, maps.Values, maps.Clone', 'maps.Sort, maps.Filter', 'maps.Merge, maps.Intersect', 'maps.Lock, maps.Unlock'],
    },
    correct: 0 as const,
    explanation: { ru: 'Пакет maps (Go 1.21+) предоставляет утилиты: Keys, Values, Clone, Copy, Equal, DeleteFunc и другие.', en: 'The maps package (Go 1.21+) provides utilities: Keys, Values, Clone, Copy, Equal, DeleteFunc, and others.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['maps', 'stdlib', 'go1.21'],
  },
]

// ── Primitives: Slices (20 questions) ───────────────────────────────────────
const questionsPrimitivesSlices: BilingualQuestion[] = [
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'Из чего состоит внутренняя структура слайса в Go?', en: 'What does the internal structure of a slice in Go consist of?' },
    options: {
      ru: ['Указатель на массив, длина (len), ёмкость (cap)', 'Только указатель и длина', 'Указатель, длина, ёмкость и тип элемента', 'Массив с динамическим размером'],
      en: ['Pointer to array, length (len), capacity (cap)', 'Only pointer and length', 'Pointer, length, capacity, and element type', 'A dynamically-sized array'],
    },
    correct: 0 as const,
    explanation: { ru: 'Слайс — это заголовок (header) из трёх полей: указатель на underlying array, len и cap.', en: 'A slice is a header of three fields: a pointer to the underlying array, len, and cap.' },
    difficulty: 'basic' as const,
    tags: ['slices', 'internals', 'structure'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'В чём разница между nil слайсом и пустым слайсом?', en: 'What is the difference between a nil slice and an empty slice?' },
    options: {
      ru: ['nil слайс имеет nil указатель, пустой — ненулевой указатель; оба имеют len=0', 'Нет разницы, они идентичны', 'nil слайс вызывает panic при обращении к len()', 'Пустой слайс нельзя передать в append'],
      en: ['nil slice has a nil pointer, empty has a non-nil pointer; both have len=0', 'No difference, they are identical', 'nil slice panics when len() is called', 'Empty slice cannot be passed to append'],
    },
    correct: 0 as const,
    explanation: { ru: 'nil слайс: var s []int (указатель nil). Пустой: s := []int{} (указатель != nil). Оба имеют len=0 и cap=0, оба работают с append.', en: 'nil slice: var s []int (pointer is nil). Empty: s := []int{} (pointer != nil). Both have len=0 and cap=0, both work with append.' },
    difficulty: 'basic' as const,
    tags: ['slices', 'nil', 'empty'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'Что происходит при вызове append(), если cap слайса исчерпана?', en: 'What happens when append() is called and the slice capacity is exhausted?' },
    options: {
      ru: ['Выделяется новый массив большего размера, данные копируются', 'panic: slice overflow', 'Элемент добавляется в конец существующего массива', 'Возвращается ошибка'],
      en: ['A new larger array is allocated and data is copied', 'panic: slice overflow', 'The element is added to the end of the existing array', 'An error is returned'],
    },
    correct: 0 as const,
    explanation: { ru: 'Когда cap исчерпана, Go выделяет новый backing array (примерно 2x для малых слайсов), копирует данные и возвращает новый слайс.', en: 'When cap is exhausted, Go allocates a new backing array (roughly 2x for small slices), copies data, and returns a new slice.' },
    difficulty: 'basic' as const,
    tags: ['slices', 'append', 'capacity'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'Что делает make([]int, 5, 10)?', en: 'What does make([]int, 5, 10) do?' },
    options: {
      ru: ['Создаёт слайс с len=5, cap=10, элементы инициализированы нулями', 'Создаёт слайс с len=10, cap=5', 'Создаёт слайс с 5 элементами от 0 до 10', 'Ошибка: len не может быть меньше cap'],
      en: ['Creates a slice with len=5, cap=10, elements initialized to zero', 'Creates a slice with len=10, cap=5', 'Creates a slice with 5 elements from 0 to 10', 'Error: len cannot be less than cap'],
    },
    correct: 0 as const,
    explanation: { ru: 'make([]int, 5, 10) создаёт слайс длиной 5 и ёмкостью 10. Первые 5 элементов инициализированы нулями.', en: 'make([]int, 5, 10) creates a slice with length 5 and capacity 10. The first 5 elements are initialized to zero.' },
    difficulty: 'basic' as const,
    tags: ['slices', 'make'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'Что возвращает copy(dst, src)?', en: 'What does copy(dst, src) return?' },
    options: {
      ru: ['Количество скопированных элементов: min(len(dst), len(src))', 'Новый слайс с объединением dst и src', 'Ошибку, если размеры не совпадают', 'Ничего (void)'],
      en: ['The number of copied elements: min(len(dst), len(src))', 'A new slice merging dst and src', 'An error if sizes do not match', 'Nothing (void)'],
    },
    correct: 0 as const,
    explanation: { ru: 'copy возвращает количество скопированных элементов, которое равно min(len(dst), len(src)).', en: 'copy returns the number of elements copied, which equals min(len(dst), len(src)).' },
    difficulty: 'basic' as const,
    tags: ['slices', 'copy'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'Что произойдёт с оригинальным слайсом при изменении подслайса (sub-slice)?', en: 'What happens to the original slice when a sub-slice is modified?' },
    options: {
      ru: ['Оригинал тоже изменится — они разделяют underlying array', 'Ничего — подслайс является копией', 'panic: shared memory access', 'Поведение не определено'],
      en: ['The original changes too — they share the underlying array', 'Nothing — the sub-slice is a copy', 'panic: shared memory access', 'Behavior is undefined'],
    },
    correct: 0 as const,
    explanation: { ru: 'Подслайс разделяет underlying array с оригиналом. Изменение элемента в подслайсе изменит и оригинал.', en: 'A sub-slice shares the underlying array with the original. Modifying an element in the sub-slice also modifies the original.' },
    difficulty: 'basic' as const,
    tags: ['slices', 'sub-slice', 'shared-array'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'Как создать двумерный слайс в Go?', en: 'How do you create a 2D slice in Go?' },
    options: {
      ru: ['Создать [][]int и инициализировать каждую строку отдельно', 'make([][]int, rows, cols) создаёт 2D слайс', 'var s [3][4]int — это двумерный слайс', 'Go не поддерживает многомерные слайсы'],
      en: ['Create [][]int and initialize each row separately', 'make([][]int, rows, cols) creates a 2D slice', 'var s [3][4]int — this is a 2D slice', 'Go does not support multi-dimensional slices'],
    },
    correct: 0 as const,
    explanation: { ru: '2D слайс — это слайс слайсов. Каждую внутреннюю строку нужно инициализировать отдельно через make.', en: 'A 2D slice is a slice of slices. Each inner row must be initialized separately via make.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['slices', '2d', 'initialization'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'Как удалить элемент из слайса БЕЗ сохранения порядка?', en: 'How do you remove an element from a slice WITHOUT preserving order?' },
    options: {
      ru: ['s[i] = s[len(s)-1]; s = s[:len(s)-1]', 'delete(s, i)', 's = append(s[:i], s[i+1:]...)', 's.Remove(i)'],
      en: ['s[i] = s[len(s)-1]; s = s[:len(s)-1]', 'delete(s, i)', 's = append(s[:i], s[i+1:]...)', 's.Remove(i)'],
    },
    correct: 0 as const,
    explanation: { ru: 'Замена элемента последним и усечение — O(1) операция, самый быстрый способ удаления без сохранения порядка.', en: 'Swapping the element with the last one and truncating is an O(1) operation, the fastest way to remove without preserving order.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['slices', 'remove', 'performance'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'Как удалить элемент из слайса С сохранением порядка?', en: 'How do you remove an element from a slice WITH order preservation?' },
    options: {
      ru: ['s = append(s[:i], s[i+1:]...)', 's[i] = s[len(s)-1]; s = s[:len(s)-1]', 'delete(s, i)', 'copy(s[i:], s[i+1:])'],
      en: ['s = append(s[:i], s[i+1:]...)', 's[i] = s[len(s)-1]; s = s[:len(s)-1]', 'delete(s, i)', 'copy(s[i:], s[i+1:])'],
    },
    correct: 0 as const,
    explanation: { ru: 'append(s[:i], s[i+1:]...) сдвигает элементы и сохраняет порядок, но это O(n) операция.', en: 'append(s[:i], s[i+1:]...) shifts elements and preserves order, but it is an O(n) operation.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['slices', 'remove', 'order'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'Какая функция используется для сортировки слайса?', en: 'Which function is used to sort a slice?' },
    options: {
      ru: ['sort.Slice(s, func(i, j int) bool { ... })', 's.Sort()', 'slices.Sort(s) (Go 1.21+) или sort.Slice', 'sort.Array(s)'],
      en: ['sort.Slice(s, func(i, j int) bool { ... })', 's.Sort()', 'slices.Sort(s) (Go 1.21+) or sort.Slice', 'sort.Array(s)'],
    },
    correct: 0 as const,
    explanation: { ru: 'sort.Slice принимает слайс и функцию сравнения. В Go 1.21+ также доступен slices.SortFunc для более удобного API.', en: 'sort.Slice takes a slice and a comparison function. Go 1.21+ also offers slices.SortFunc for a more convenient API.' },
    difficulty: 'basic' as const,
    tags: ['slices', 'sort'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'Как добавить все элементы одного слайса в другой?', en: 'How do you append all elements of one slice to another?' },
    options: {
      ru: ['s1 = append(s1, s2...)', 's1 = append(s1, s2)', 'copy(s1, s2)', 's1.AddAll(s2)'],
      en: ['s1 = append(s1, s2...)', 's1 = append(s1, s2)', 'copy(s1, s2)', 's1.AddAll(s2)'],
    },
    correct: 0 as const,
    explanation: { ru: 'Оператор ... «распаковывает» слайс, позволяя передать его элементы в вариативную функцию append.', en: 'The ... operator "unpacks" a slice, allowing its elements to be passed to the variadic append function.' },
    difficulty: 'basic' as const,
    tags: ['slices', 'append', 'variadic'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'Что произойдёт с len слайса внутри функции при append?', en: 'What happens to a slice len inside a function when using append?' },
    options: {
      ru: ['Вызывающий код не увидит изменение len (заголовок копируется)', 'len изменится у вызывающего кода тоже', 'Будет panic при превышении cap', 'append не работает внутри функций'],
      en: ['The caller will not see the len change (header is copied)', 'len will change in the caller too', 'It will panic when cap is exceeded', 'append does not work inside functions'],
    },
    correct: 0 as const,
    explanation: { ru: 'Слайс передаётся по значению (копируется заголовок). append меняет len в копии, но вызывающий код видит старый len. Для изменения нужно возвращать результат append.', en: 'A slice is passed by value (the header is copied). append changes len in the copy, but the caller sees the old len. You must return the result of append.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['slices', 'append', 'pass-by-value'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'В чём разница между len и cap слайса?', en: 'What is the difference between len and cap of a slice?' },
    options: {
      ru: ['len — количество элементов, cap — размер underlying array от начала слайса', 'len и cap всегда равны', 'cap — максимальное значение len за всё время', 'len — для чтения, cap — для записи'],
      en: ['len — number of elements, cap — size of underlying array from slice start', 'len and cap are always equal', 'cap — maximum len value ever', 'len — for reading, cap — for writing'],
    },
    correct: 0 as const,
    explanation: { ru: 'len — текущее количество элементов. cap — количество элементов от начала слайса до конца underlying array.', en: 'len is the current number of elements. cap is the number of elements from the start of the slice to the end of the underlying array.' },
    difficulty: 'basic' as const,
    tags: ['slices', 'len', 'cap'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'Как растёт ёмкость слайса при append?', en: 'How does slice capacity grow during append?' },
    options: {
      ru: ['Примерно в 2 раза для малых слайсов, потом медленнее', 'Всегда удваивается', 'Увеличивается на 1 каждый раз', 'Увеличивается в 1.5 раза'],
      en: ['Roughly 2x for small slices, then slower', 'Always doubles', 'Increases by 1 each time', 'Increases by 1.5x'],
    },
    correct: 0 as const,
    explanation: { ru: 'Для малых слайсов cap удваивается. Для больших (>256 элементов) рост составляет ~1.25x + константа. Точная формула зависит от версии Go.', en: 'For small slices, cap doubles. For large ones (>256 elements), growth is ~1.25x + a constant. The exact formula depends on the Go version.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['slices', 'capacity', 'growth'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'Как получить слайс из массива?', en: 'How do you get a slice from an array?' },
    options: {
      ru: ['a[2:5] — подслайс элементов с индексами 2, 3, 4', 'slice(a, 2, 5)', 'a.Slice(2, 5)', '[]int(a)[2:5]'],
      en: ['a[2:5] — sub-slice of elements at indices 2, 3, 4', 'slice(a, 2, 5)', 'a.Slice(2, 5)', '[]int(a)[2:5]'],
    },
    correct: 0 as const,
    explanation: { ru: 'a[low:high] создаёт слайс, ссылающийся на элементы массива от low до high-1.', en: 'a[low:high] creates a slice referencing array elements from low to high-1.' },
    difficulty: 'basic' as const,
    tags: ['slices', 'array', 'sub-slice'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'Что делает полное выражение среза a[low:high:max]?', en: 'What does the full slice expression a[low:high:max] do?' },
    options: {
      ru: ['Создаёт слайс с len=high-low и cap=max-low', 'Создаёт слайс с шагом max', 'Ограничивает максимальный len слайса', 'Это синтаксическая ошибка'],
      en: ['Creates a slice with len=high-low and cap=max-low', 'Creates a slice with step max', 'Limits the maximum len of the slice', 'This is a syntax error'],
    },
    correct: 0 as const,
    explanation: { ru: 'Трёхиндексное выражение a[low:high:max] ограничивает cap результирующего слайса до max-low, защищая от случайного перезаписывания данных.', en: 'The three-index expression a[low:high:max] limits the cap of the resulting slice to max-low, protecting against accidental overwrites.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['slices', 'full-slice', 'cap'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'Почему изменение подслайса влияет на оригинал?', en: 'Why does modifying a sub-slice affect the original?' },
    options: {
      ru: ['Они разделяют один и тот же underlying array', 'Подслайс хранит указатель на оригинальный слайс', 'Go автоматически синхронизирует данные', 'Это баг в Go'],
      en: ['They share the same underlying array', 'The sub-slice stores a pointer to the original slice', 'Go automatically synchronizes data', 'This is a bug in Go'],
    },
    correct: 0 as const,
    explanation: { ru: 'Подслайс получает указатель на тот же underlying array. Запись через один слайс видна через другой.', en: 'A sub-slice gets a pointer to the same underlying array. Writing through one slice is visible through the other.' },
    difficulty: 'basic' as const,
    tags: ['slices', 'sub-slice', 'shared-array'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'Как создать независимую копию (клон) слайса?', en: 'How do you create an independent copy (clone) of a slice?' },
    options: {
      ru: ['slices.Clone(s) (Go 1.21+) или append([]T(nil), s...)', 'clone := s', 'clone := &s', 'clone := make([]T, s)'],
      en: ['slices.Clone(s) (Go 1.21+) or append([]T(nil), s...)', 'clone := s', 'clone := &s', 'clone := make([]T, s)'],
    },
    correct: 0 as const,
    explanation: { ru: 'slices.Clone (Go 1.21+) создаёт клон. Ранее использовалась идиома append([]T(nil), s...) или make + copy.', en: 'slices.Clone (Go 1.21+) creates a clone. Previously the idiom append([]T(nil), s...) or make + copy was used.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['slices', 'clone', 'copy'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'Как проверить, содержит ли слайс элемент (Go 1.21+)?', en: 'How do you check if a slice contains an element (Go 1.21+)?' },
    options: {
      ru: ['slices.Contains(s, elem)', 's.Contains(elem)', 'slices.Has(s, elem)', 'sort.Search(s, elem)'],
      en: ['slices.Contains(s, elem)', 's.Contains(elem)', 'slices.Has(s, elem)', 'sort.Search(s, elem)'],
    },
    correct: 0 as const,
    explanation: { ru: 'slices.Contains (Go 1.21+) выполняет линейный поиск элемента в слайсе.', en: 'slices.Contains (Go 1.21+) performs a linear search for an element in the slice.' },
    difficulty: 'basic' as const,
    tags: ['slices', 'slices-package', 'contains'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-slices', quizId: null,
    question: { ru: 'Чему равны элементы слайса после make([]int, 5)?', en: 'What are the element values after make([]int, 5)?' },
    options: {
      ru: ['Все элементы равны 0 (нулевое значение int)', 'Элементы не инициализированы (мусор)', 'nil', 'Пустые значения'],
      en: ['All elements are 0 (zero value of int)', 'Elements are uninitialized (garbage)', 'nil', 'Empty values'],
    },
    correct: 0 as const,
    explanation: { ru: 'Go всегда инициализирует память нулевыми значениями. Для int это 0, для string — "", для указателей — nil.', en: 'Go always initializes memory with zero values. For int it is 0, for string it is "", for pointers it is nil.' },
    difficulty: 'basic' as const,
    tags: ['slices', 'zero-value', 'make'],
  },
]

// ── Primitives: Interfaces (20 questions) ───────────────────────────────────
const questionsPrimitivesInterfaces: BilingualQuestion[] = [
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Как тип реализует интерфейс в Go?', en: 'How does a type implement an interface in Go?' },
    options: {
      ru: ['Неявно — достаточно реализовать все методы интерфейса', 'Явно — нужно написать implements', 'Через наследование', 'Через аннотацию @implements'],
      en: ['Implicitly — it is enough to implement all interface methods', 'Explicitly — you need to write implements', 'Through inheritance', 'Through the @implements annotation'],
    },
    correct: 0 as const,
    explanation: { ru: 'В Go реализация интерфейса неявная (implicit). Тип реализует интерфейс, если имеет все его методы.', en: 'In Go, interface implementation is implicit. A type implements an interface if it has all its methods.' },
    difficulty: 'basic' as const,
    tags: ['interfaces', 'implicit'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Как определить интерфейс в Go?', en: 'How do you define an interface in Go?' },
    options: {
      ru: ['type MyInterface interface { Method() }', 'interface MyInterface { Method() }', 'type MyInterface = interface { Method() }', 'class MyInterface { abstract Method() }'],
      en: ['type MyInterface interface { Method() }', 'interface MyInterface { Method() }', 'type MyInterface = interface { Method() }', 'class MyInterface { abstract Method() }'],
    },
    correct: 0 as const,
    explanation: { ru: 'Интерфейс определяется через type Name interface { ... } с перечислением сигнатур методов.', en: 'An interface is defined with type Name interface { ... } listing method signatures.' },
    difficulty: 'basic' as const,
    tags: ['interfaces', 'definition', 'syntax'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Что такое interface{} (или any) в Go?', en: 'What is interface{} (or any) in Go?' },
    options: {
      ru: ['Пустой интерфейс, который реализует любой тип', 'Специальный тип для обработки ошибок', 'Базовый класс для всех типов', 'Синтаксическая ошибка'],
      en: ['An empty interface that any type implements', 'A special type for error handling', 'A base class for all types', 'A syntax error'],
    },
    correct: 0 as const,
    explanation: { ru: 'interface{} (alias any с Go 1.18) — пустой интерфейс без методов. Любой тип его реализует, так как не нужно реализовывать ни одного метода.', en: 'interface{} (alias any since Go 1.18) is an empty interface with no methods. Any type implements it since no methods need to be implemented.' },
    difficulty: 'basic' as const,
    tags: ['interfaces', 'empty-interface', 'any'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Что произойдёт при неудачном type assertion v := i.(T)?', en: 'What happens on a failed type assertion v := i.(T)?' },
    options: {
      ru: ['panic', 'v получит нулевое значение T', 'Ошибка компиляции', 'Вернётся nil'],
      en: ['panic', 'v gets the zero value of T', 'Compilation error', 'nil is returned'],
    },
    correct: 0 as const,
    explanation: { ru: 'Однозначный type assertion v := i.(T) вызывает panic, если i не содержит тип T. Безопасный вариант: v, ok := i.(T).', en: 'A single-value type assertion v := i.(T) panics if i does not hold type T. The safe form is: v, ok := i.(T).' },
    difficulty: 'basic' as const,
    tags: ['interfaces', 'type-assertion', 'panic'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Как безопасно выполнить type assertion?', en: 'How do you safely perform a type assertion?' },
    options: {
      ru: ['v, ok := i.(T) — ok будет false при неудаче', 'try { v := i.(T) }', 'v := i.(T) — всегда безопасно', 'if i is T { v := i.(T) }'],
      en: ['v, ok := i.(T) — ok will be false on failure', 'try { v := i.(T) }', 'v := i.(T) — always safe', 'if i is T { v := i.(T) }'],
    },
    correct: 0 as const,
    explanation: { ru: 'Форма с двумя значениями v, ok := i.(T) не паникует. ok == false означает, что i не содержит тип T.', en: 'The two-value form v, ok := i.(T) does not panic. ok == false means i does not hold type T.' },
    difficulty: 'basic' as const,
    tags: ['interfaces', 'type-assertion', 'comma-ok'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Что делает type switch в Go?', en: 'What does a type switch do in Go?' },
    options: {
      ru: ['Проверяет динамический тип интерфейса по нескольким вариантам', 'Переключает тип переменной', 'Конвертирует тип в другой', 'Создаёт новый тип на основе существующего'],
      en: ['Checks the dynamic type of an interface against multiple cases', 'Switches the type of a variable', 'Converts a type to another', 'Creates a new type based on an existing one'],
    },
    correct: 0 as const,
    explanation: { ru: 'switch v := i.(type) позволяет проверить динамический тип интерфейса по нескольким case-веткам.', en: 'switch v := i.(type) allows checking the dynamic type of an interface against multiple case branches.' },
    difficulty: 'basic' as const,
    tags: ['interfaces', 'type-switch'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'В чём разница между nil интерфейсом и интерфейсом, хранящим nil указатель?', en: 'What is the difference between a nil interface and an interface holding a nil pointer?' },
    options: {
      ru: ['nil интерфейс == nil; интерфейс с nil указателем != nil (имеет тип)', 'Нет разницы, оба == nil', 'Оба != nil', 'Интерфейс не может хранить nil указатель'],
      en: ['nil interface == nil; interface with nil pointer != nil (has a type)', 'No difference, both == nil', 'Both != nil', 'An interface cannot hold a nil pointer'],
    },
    correct: 0 as const,
    explanation: { ru: 'Интерфейс содержит пару (тип, значение). nil интерфейс имеет оба поля nil. Интерфейс с nil указателем имеет ненулевой тип, поэтому != nil.', en: 'An interface holds a (type, value) pair. A nil interface has both fields nil. An interface with a nil pointer has a non-nil type, so it != nil.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['interfaces', 'nil', 'pitfall'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Что такое встраивание (embedding) интерфейсов?', en: 'What is interface embedding?' },
    options: {
      ru: ['Включение одного интерфейса в другой для объединения методов', 'Наследование интерфейса', 'Имплементация интерфейса внутри структуры', 'Создание вложенного интерфейса'],
      en: ['Including one interface in another to combine methods', 'Interface inheritance', 'Implementing an interface inside a struct', 'Creating a nested interface'],
    },
    correct: 0 as const,
    explanation: { ru: 'Встраивание позволяет объединять методы нескольких интерфейсов: type ReadWriter interface { Reader; Writer }.', en: 'Embedding allows combining methods from multiple interfaces: type ReadWriter interface { Reader; Writer }.' },
    difficulty: 'basic' as const,
    tags: ['interfaces', 'embedding', 'composition'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Какой метод нужно реализовать для интерфейса fmt.Stringer?', en: 'Which method must be implemented for the fmt.Stringer interface?' },
    options: {
      ru: ['String() string', 'ToString() string', 'Format() string', 'Print() string'],
      en: ['String() string', 'ToString() string', 'Format() string', 'Print() string'],
    },
    correct: 0 as const,
    explanation: { ru: 'fmt.Stringer требует метод String() string. Он используется fmt.Println и подобными для вывода значения.', en: 'fmt.Stringer requires the method String() string. It is used by fmt.Println and similar functions to print a value.' },
    difficulty: 'basic' as const,
    tags: ['interfaces', 'fmt.Stringer', 'stdlib'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Какой метод определяет интерфейс error?', en: 'Which method defines the error interface?' },
    options: {
      ru: ['Error() string', 'Message() string', 'String() string', 'Err() string'],
      en: ['Error() string', 'Message() string', 'String() string', 'Err() string'],
    },
    correct: 0 as const,
    explanation: { ru: 'Встроенный интерфейс error определяет единственный метод Error() string.', en: 'The built-in error interface defines a single method Error() string.' },
    difficulty: 'basic' as const,
    tags: ['interfaces', 'error', 'stdlib'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Какие основные интерфейсы определены в пакете io?', en: 'What are the main interfaces defined in the io package?' },
    options: {
      ru: ['io.Reader и io.Writer', 'io.Input и io.Output', 'io.Stream и io.Buffer', 'io.File и io.Socket'],
      en: ['io.Reader and io.Writer', 'io.Input and io.Output', 'io.Stream and io.Buffer', 'io.File and io.Socket'],
    },
    correct: 0 as const,
    explanation: { ru: 'io.Reader (Read(p []byte) (n int, err error)) и io.Writer (Write(p []byte) (n int, err error)) — фундаментальные интерфейсы Go.', en: 'io.Reader (Read(p []byte) (n int, err error)) and io.Writer (Write(p []byte) (n int, err error)) are fundamental Go interfaces.' },
    difficulty: 'basic' as const,
    tags: ['interfaces', 'io', 'stdlib'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Как проверить на этапе компиляции, что тип реализует интерфейс?', en: 'How do you verify at compile time that a type implements an interface?' },
    options: {
      ru: ['var _ Interface = (*Type)(nil)', 'implements(Type, Interface)', 'Type.Implements(Interface)', 'static_assert(Type, Interface)'],
      en: ['var _ Interface = (*Type)(nil)', 'implements(Type, Interface)', 'Type.Implements(Interface)', 'static_assert(Type, Interface)'],
    },
    correct: 0 as const,
    explanation: { ru: 'Идиома var _ Interface = (*Type)(nil) вызовет ошибку компиляции, если *Type не реализует Interface.', en: 'The idiom var _ Interface = (*Type)(nil) will cause a compile error if *Type does not implement Interface.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['interfaces', 'compile-time-check', 'idiom'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Может ли интерфейс содержать несколько методов?', en: 'Can an interface contain multiple methods?' },
    options: {
      ru: ['Да, интерфейс может содержать любое количество методов', 'Нет, только один метод', 'Максимум 3 метода', 'Только если они все возвращают error'],
      en: ['Yes, an interface can contain any number of methods', 'No, only one method', 'Maximum 3 methods', 'Only if they all return error'],
    },
    correct: 0 as const,
    explanation: { ru: 'Интерфейс может содержать любое количество методов. Однако в Go принято делать интерфейсы маленькими (1-2 метода).', en: 'An interface can contain any number of methods. However, in Go it is conventional to keep interfaces small (1-2 methods).' },
    difficulty: 'basic' as const,
    tags: ['interfaces', 'design', 'methods'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Можно ли возвращать интерфейс из функции?', en: 'Can you return an interface from a function?' },
    options: {
      ru: ['Да, это идиоматический подход ("accept interfaces, return structs" — рекомендация, не правило)', 'Нет, можно вернуть только конкретный тип', 'Только если интерфейс пустой', 'Только если функция экспортирована'],
      en: ['Yes, this is common ("accept interfaces, return structs" is a guideline, not a rule)', 'No, you can only return concrete types', 'Only if the interface is empty', 'Only if the function is exported'],
    },
    correct: 0 as const,
    explanation: { ru: 'Функция может возвращать интерфейс. Наиболее частый пример — error как возвращаемый тип.', en: 'A function can return an interface. The most common example is error as a return type.' },
    difficulty: 'basic' as const,
    tags: ['interfaces', 'return-type', 'design'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Можно ли сравнивать интерфейсы оператором ==?', en: 'Can interfaces be compared with the == operator?' },
    options: {
      ru: ['Да, если динамические типы comparable; иначе panic', 'Нет, интерфейсы нельзя сравнивать', 'Да, всегда сравниваются по указателю', 'Только с nil'],
      en: ['Yes, if dynamic types are comparable; otherwise panic', 'No, interfaces cannot be compared', 'Yes, always compared by pointer', 'Only with nil'],
    },
    correct: 0 as const,
    explanation: { ru: 'Интерфейсы можно сравнивать через ==. Если динамические типы comparable — сравнение работает. Если нет (например, слайс) — panic.', en: 'Interfaces can be compared with ==. If dynamic types are comparable, it works. If not (e.g., slice), it panics.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['interfaces', 'comparison', 'panic'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Что содержит интерфейсная переменная внутри?', en: 'What does an interface variable contain internally?' },
    options: {
      ru: ['Пару (динамический тип, значение)', 'Только значение', 'Указатель на vtable', 'Хеш-таблицу методов'],
      en: ['A pair (dynamic type, value)', 'Only the value', 'A pointer to a vtable', 'A hash table of methods'],
    },
    correct: 0 as const,
    explanation: { ru: 'Интерфейс в Go представлен структурой из двух полей: указатель на информацию о типе (itable/itab) и указатель на данные.', en: 'An interface in Go is represented by a struct with two fields: a pointer to type information (itable/itab) and a pointer to data.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['interfaces', 'internals', 'dynamic-type'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Если метод определён на *T (pointer receiver), реализует ли T (value receiver) интерфейс?', en: 'If a method is defined on *T (pointer receiver), does T (value receiver) implement the interface?' },
    options: {
      ru: ['Нет, только *T реализует интерфейс', 'Да, T автоматически получает методы *T', 'Зависит от размера T', 'Оба реализуют интерфейс'],
      en: ['No, only *T implements the interface', 'Yes, T automatically gets *T methods', 'Depends on the size of T', 'Both implement the interface'],
    },
    correct: 0 as const,
    explanation: { ru: 'Если метод на *T — только *T реализует интерфейс. Если метод на T — и T, и *T реализуют интерфейс (Go автоматически берёт адрес).', en: 'If a method is on *T, only *T implements the interface. If on T, both T and *T implement it (Go automatically takes the address).' },
    difficulty: 'basic-intermediate' as const,
    tags: ['interfaces', 'pointer-receiver', 'value-receiver'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Что такое принцип разделения интерфейсов (ISP) в контексте Go?', en: 'What is the Interface Segregation Principle (ISP) in the context of Go?' },
    options: {
      ru: ['Много маленьких интерфейсов лучше одного большого', 'Интерфейсы должны быть в отдельном пакете', 'Каждый тип должен реализовать только один интерфейс', 'Интерфейсы не должны использоваться вместе со структурами'],
      en: ['Many small interfaces are better than one large one', 'Interfaces should be in a separate package', 'Each type should implement only one interface', 'Interfaces should not be used together with structs'],
    },
    correct: 0 as const,
    explanation: { ru: 'ISP в Go выражается в предпочтении маленьких интерфейсов (io.Reader, io.Writer) вместо больших "God-интерфейсов".', en: 'ISP in Go is expressed as preferring small interfaces (io.Reader, io.Writer) over large "God interfaces".' },
    difficulty: 'basic-intermediate' as const,
    tags: ['interfaces', 'ISP', 'design'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Когда используется интерфейс как параметр функции?', en: 'When is an interface used as a function parameter?' },
    options: {
      ru: ['Когда функция должна работать с любым типом, реализующим нужное поведение', 'Только для тестирования (мок)', 'Только в стандартной библиотеке', 'Когда неизвестен конкретный тип на этапе компиляции'],
      en: ['When the function should work with any type implementing the required behavior', 'Only for testing (mocks)', 'Only in the standard library', 'When the concrete type is unknown at compile time'],
    },
    correct: 0 as const,
    explanation: { ru: 'Принятие интерфейса как параметра делает функцию гибкой: можно передать любой тип с нужными методами. Это также упрощает тестирование.', en: 'Accepting an interface as a parameter makes the function flexible: any type with the required methods can be passed. This also simplifies testing.' },
    difficulty: 'basic' as const,
    tags: ['interfaces', 'function-parameter', 'design'],
  },
  {
    type: 'mcq' as const, blockId: 'primitives-interfaces', quizId: null,
    question: { ru: 'Почему передача указателя на интерфейс (*interface) считается антипаттерном?', en: 'Why is passing a pointer to an interface (*interface) considered an antipattern?' },
    options: {
      ru: ['Интерфейс уже содержит указатель на данные, дополнительный уровень не нужен', 'Указатели на интерфейсы запрещены в Go', 'Это вызывает утечку памяти', 'Производительность ухудшается в 10 раз'],
      en: ['An interface already contains a pointer to data, an extra level is unnecessary', 'Pointers to interfaces are forbidden in Go', 'It causes memory leaks', 'Performance degrades 10x'],
    },
    correct: 0 as const,
    explanation: { ru: 'Интерфейс — это уже пара (тип, указатель на данные). Передача *interface добавляет ненужный уровень косвенности и ломает type assertions.', en: 'An interface is already a (type, pointer to data) pair. Passing *interface adds an unnecessary level of indirection and breaks type assertions.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['interfaces', 'antipattern', 'pointer'],
  },
]

// ── OOP: SOLID Principles (20 questions) ──────────────────────────────────
const questionsOopSolid: BilingualQuestion[] = [
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Что означает принцип единственной ответственности (SRP)?', en: 'What does the Single Responsibility Principle (SRP) mean?' },
    options: {
      ru: ['Каждый модуль/тип должен иметь только одну причину для изменения', 'Каждая функция должна быть не длиннее 20 строк', 'Каждый пакет должен экспортировать только один тип', 'Каждый файл должен содержать только одну структуру'],
      en: ['Each module/type should have only one reason to change', 'Each function should be no longer than 20 lines', 'Each package should export only one type', 'Each file should contain only one struct'],
    },
    correct: 0 as const,
    explanation: { ru: 'SRP гласит, что у модуля должна быть только одна причина для изменения — одна зона ответственности.', en: 'SRP states that a module should have only one reason to change — one area of responsibility.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['solid', 'srp'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Какой признак нарушения SRP в Go-структуре?', en: 'What is a sign of SRP violation in a Go struct?' },
    options: {
      ru: ['Структура содержит методы для работы с БД и для форматирования вывода', 'Структура реализует два интерфейса', 'Структура имеет более 5 полей', 'Структура использует встраивание'],
      en: ['The struct has methods for DB access and for formatting output', 'The struct implements two interfaces', 'The struct has more than 5 fields', 'The struct uses embedding'],
    },
    correct: 0 as const,
    explanation: { ru: 'Если структура занимается и доступом к данным, и форматированием — это две причины для изменения, нарушение SRP.', en: 'If a struct handles both data access and formatting — those are two reasons to change, violating SRP.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['solid', 'srp', 'violation'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Что означает принцип открытости/закрытости (OCP)?', en: 'What does the Open/Closed Principle (OCP) mean?' },
    options: {
      ru: ['Модуль открыт для расширения, но закрыт для модификации', 'Пакет должен быть открытым (public)', 'Исходный код должен быть open source', 'Структура может быть расширена только через встраивание'],
      en: ['A module is open for extension but closed for modification', 'A package must be public (open)', 'Source code must be open source', 'A struct can only be extended via embedding'],
    },
    correct: 0 as const,
    explanation: { ru: 'OCP: можно добавлять новое поведение без изменения существующего кода — в Go это достигается через интерфейсы.', en: 'OCP: you can add new behavior without modifying existing code — in Go this is achieved through interfaces.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['solid', 'ocp'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Как в Go реализуется OCP через интерфейсы?', en: 'How is OCP implemented in Go via interfaces?' },
    options: {
      ru: ['Функция принимает интерфейс, и новые типы добавляются без изменения функции', 'Используется наследование от базового класса', 'Применяется ключевое слово extends', 'Функция принимает пустой интерфейс interface{}'],
      en: ['A function accepts an interface, and new types are added without changing the function', 'Inheritance from a base class is used', 'The extends keyword is applied', 'A function accepts the empty interface interface{}'],
    },
    correct: 0 as const,
    explanation: { ru: 'Если функция зависит от интерфейса, новые реализации добавляются без изменения этой функции — это OCP.', en: 'If a function depends on an interface, new implementations are added without modifying the function — that is OCP.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['solid', 'ocp', 'interfaces'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Что означает принцип подстановки Лисков (LSP)?', en: 'What does the Liskov Substitution Principle (LSP) mean?' },
    options: {
      ru: ['Подтип должен быть заменяем базовым типом без нарушения корректности', 'Каждый тип должен быть подставляем в любую функцию', 'Все типы должны реализовывать интерфейс fmt.Stringer', 'Подтипы запрещены в Go'],
      en: ['A subtype must be replaceable by the base type without breaking correctness', 'Every type must be substitutable into any function', 'All types must implement fmt.Stringer', 'Subtypes are forbidden in Go'],
    },
    correct: 0 as const,
    explanation: { ru: 'LSP: если тип T2 заменяет T1, программа должна работать корректно. В Go это значит — контракт интерфейса соблюдается.', en: 'LSP: if type T2 replaces T1, the program should still work correctly. In Go this means — the interface contract is honored.' },
    difficulty: 'intermediate' as const,
    tags: ['solid', 'lsp'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Как нарушается LSP при встраивании в Go?', en: 'How can LSP be violated with embedding in Go?' },
    options: {
      ru: ['Встроенный тип переопределяет метод, меняя контракт интерфейса', 'Встраивание всегда нарушает LSP', 'Встраивание нескольких структур одновременно', 'Использование pointer receiver вместо value receiver'],
      en: ['The embedded type overrides a method, changing the interface contract', 'Embedding always violates LSP', 'Embedding multiple structs simultaneously', 'Using pointer receiver instead of value receiver'],
    },
    correct: 0 as const,
    explanation: { ru: 'Если shadowing метода меняет поведение, ожидаемое клиентом интерфейса, это нарушает LSP.', en: 'If method shadowing changes behavior expected by the interface client, it violates LSP.' },
    difficulty: 'intermediate' as const,
    tags: ['solid', 'lsp', 'embedding'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Что означает принцип разделения интерфейсов (ISP)?', en: 'What does the Interface Segregation Principle (ISP) mean?' },
    options: {
      ru: ['Клиент не должен зависеть от методов, которые он не использует', 'Каждый интерфейс должен быть в отдельном файле', 'Интерфейсы нельзя встраивать друг в друга', 'Интерфейс должен иметь ровно один метод'],
      en: ['A client should not depend on methods it does not use', 'Each interface must be in a separate file', 'Interfaces cannot embed each other', 'An interface must have exactly one method'],
    },
    correct: 0 as const,
    explanation: { ru: 'ISP: не заставляйте клиента зависеть от методов, которые ему не нужны. В Go это идиоматично — маленькие интерфейсы.', en: 'ISP: do not force clients to depend on methods they do not need. In Go this is idiomatic — small interfaces.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['solid', 'isp'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Какой размер интерфейса считается идиоматичным в Go?', en: 'What interface size is considered idiomatic in Go?' },
    options: {
      ru: ['1–3 метода', '5–10 методов', 'Ровно 1 метод', 'Не менее 4 методов'],
      en: ['1–3 methods', '5–10 methods', 'Exactly 1 method', 'At least 4 methods'],
    },
    correct: 0 as const,
    explanation: { ru: 'В Go приветствуются маленькие интерфейсы с 1–3 методами: io.Reader, io.Writer, fmt.Stringer.', en: 'Go favors small interfaces with 1–3 methods: io.Reader, io.Writer, fmt.Stringer.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['solid', 'isp', 'best-practices'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Что означает принцип инверсии зависимостей (DIP)?', en: 'What does the Dependency Inversion Principle (DIP) mean?' },
    options: {
      ru: ['Модули верхнего уровня не должны зависеть от модулей нижнего уровня — оба должны зависеть от абстракций', 'Зависимости должны быть инвертированы в порядке импортов', 'Нижние слои должны импортировать верхние', 'Все зависимости должны быть глобальными переменными'],
      en: ['High-level modules should not depend on low-level modules — both should depend on abstractions', 'Dependencies should be inverted in import order', 'Lower layers should import upper layers', 'All dependencies should be global variables'],
    },
    correct: 0 as const,
    explanation: { ru: 'DIP: и высокоуровневые, и низкоуровневые модули зависят от абстракций (интерфейсов), а не друг от друга.', en: 'DIP: both high-level and low-level modules depend on abstractions (interfaces), not on each other.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['solid', 'dip'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Как DIP реализуется в Go на практике?', en: 'How is DIP implemented in Go in practice?' },
    options: {
      ru: ['Функция/структура принимает интерфейс, а не конкретный тип', 'Используется пакет reflect для инъекции зависимостей', 'Все типы объявляются в одном пакете', 'Конкретные типы возвращаются из конструкторов'],
      en: ['A function/struct accepts an interface, not a concrete type', 'The reflect package is used for dependency injection', 'All types are declared in one package', 'Concrete types are returned from constructors'],
    },
    correct: 0 as const,
    explanation: { ru: 'В Go DIP реализуется через зависимость от интерфейсов: конструктор принимает интерфейс, а не конкретную реализацию.', en: 'In Go, DIP is implemented by depending on interfaces: a constructor accepts an interface, not a concrete implementation.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['solid', 'dip', 'interfaces'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Как паттерн Functional Options помогает соблюдать OCP?', en: 'How does the Functional Options pattern help follow OCP?' },
    options: {
      ru: ['Новые опции добавляются без изменения сигнатуры конструктора', 'Он запрещает изменение существующих опций', 'Он автоматически валидирует параметры', 'Он гарантирует иммутабельность структуры'],
      en: ['New options are added without changing the constructor signature', 'It forbids modifying existing options', 'It automatically validates parameters', 'It guarantees struct immutability'],
    },
    correct: 0 as const,
    explanation: { ru: 'Functional Options позволяет расширять конфигурацию новыми опциями, не ломая существующий API — это OCP.', en: 'Functional Options allows extending configuration with new options without breaking the existing API — that is OCP.' },
    difficulty: 'intermediate' as const,
    tags: ['solid', 'ocp', 'functional-options'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Что такое "God Object" и какой принцип SOLID он нарушает?', en: 'What is a "God Object" and which SOLID principle does it violate?' },
    options: {
      ru: ['Объект с множеством обязанностей — нарушает SRP', 'Объект без методов — нарушает OCP', 'Объект с одним методом — нарушает ISP', 'Синглтон — нарушает DIP'],
      en: ['An object with many responsibilities — violates SRP', 'An object with no methods — violates OCP', 'An object with one method — violates ISP', 'A singleton — violates DIP'],
    },
    correct: 0 as const,
    explanation: { ru: 'God Object берёт на себя слишком много обязанностей, что является прямым нарушением SRP.', en: 'A God Object takes on too many responsibilities, which is a direct violation of SRP.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['solid', 'srp', 'god-object'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Какой принцип SOLID нарушает switch по типу с добавлением новых case?', en: 'Which SOLID principle is violated by a type switch with added cases?' },
    options: {
      ru: ['OCP — каждый новый тип требует изменения switch', 'SRP — switch выполняет несколько задач', 'LSP — типы не взаимозаменяемы', 'DIP — switch зависит от конкретных типов'],
      en: ['OCP — each new type requires modifying the switch', 'SRP — the switch performs multiple tasks', 'LSP — types are not interchangeable', 'DIP — the switch depends on concrete types'],
    },
    correct: 0 as const,
    explanation: { ru: 'Type switch, который нужно править при каждом новом типе, нарушает OCP. Решение — полиморфизм через интерфейс.', en: 'A type switch that needs editing for each new type violates OCP. The solution is polymorphism via interface.' },
    difficulty: 'intermediate' as const,
    tags: ['solid', 'ocp', 'type-switch'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Почему io.Reader — хороший пример ISP?', en: 'Why is io.Reader a good example of ISP?' },
    options: {
      ru: ['Содержит только один метод Read — минимальный контракт', 'Он находится в стандартной библиотеке', 'Его реализуют все типы в Go', 'Он автоматически генерируется компилятором'],
      en: ['It contains only one method Read — minimal contract', 'It is in the standard library', 'All types in Go implement it', 'It is automatically generated by the compiler'],
    },
    correct: 0 as const,
    explanation: { ru: 'io.Reader содержит только Read(p []byte) (int, error) — клиенты зависят лишь от того, что им нужно.', en: 'io.Reader contains only Read(p []byte) (int, error) — clients depend only on what they need.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['solid', 'isp', 'io-reader'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Где в Go лучше объявлять интерфейс — рядом с реализацией или рядом с потребителем?', en: 'Where in Go is it better to declare an interface — near the implementation or near the consumer?' },
    options: {
      ru: ['Рядом с потребителем (consumer)', 'Рядом с реализацией', 'В отдельном пакете interfaces/', 'В корне модуля'],
      en: ['Near the consumer', 'Near the implementation', 'In a separate interfaces/ package', 'At the module root'],
    },
    correct: 0 as const,
    explanation: { ru: 'В Go идиоматично объявлять интерфейс в пакете-потребителе, определяя минимальный контракт, который ему нужен (ISP + DIP).', en: 'In Go, it is idiomatic to declare the interface in the consumer package, defining the minimal contract it needs (ISP + DIP).' },
    difficulty: 'intermediate' as const,
    tags: ['solid', 'isp', 'dip', 'best-practices'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Какой из следующих подходов нарушает DIP?', en: 'Which of the following approaches violates DIP?' },
    options: {
      ru: ['Функция создаёт зависимость внутри себя через конкретный тип', 'Функция принимает интерфейс как параметр', 'Конструктор принимает интерфейс и сохраняет его', 'Использование функциональных опций для конфигурации'],
      en: ['A function creates a dependency internally via a concrete type', 'A function accepts an interface as a parameter', 'A constructor accepts an interface and stores it', 'Using functional options for configuration'],
    },
    correct: 0 as const,
    explanation: { ru: 'Если функция сама создаёт зависимость (напр. db := sql.Open(...)), она зависит от конкретики, нарушая DIP.', en: 'If a function creates a dependency itself (e.g. db := sql.Open(...)), it depends on a concrete, violating DIP.' },
    difficulty: 'intermediate' as const,
    tags: ['solid', 'dip', 'violation'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Как SRP связан с тестируемостью кода?', en: 'How is SRP related to code testability?' },
    options: {
      ru: ['Модуль с одной ответственностью проще тестировать изолированно', 'SRP не связан с тестируемостью', 'SRP запрещает моки в тестах', 'SRP требует 100% покрытия тестами'],
      en: ['A module with one responsibility is easier to test in isolation', 'SRP is not related to testability', 'SRP forbids mocks in tests', 'SRP requires 100% test coverage'],
    },
    correct: 0 as const,
    explanation: { ru: 'Код с одной ответственностью легче тестировать: меньше зависимостей, понятнее что тестируем.', en: 'Code with one responsibility is easier to test: fewer dependencies, clearer what is being tested.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['solid', 'srp', 'testing'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Какой паттерн в Go помогает одновременно соблюсти OCP и ISP?', en: 'Which pattern in Go helps follow both OCP and ISP simultaneously?' },
    options: {
      ru: ['Middleware (цепочка обработчиков) через http.Handler', 'Глобальная переменная-реестр', 'switch по типу', 'Один большой интерфейс с 10+ методами'],
      en: ['Middleware (handler chain) via http.Handler', 'A global registry variable', 'Type switch', 'One large interface with 10+ methods'],
    },
    correct: 0 as const,
    explanation: { ru: 'Middleware через http.Handler: интерфейс мал (ISP), новые middleware добавляются без изменения существующих (OCP).', en: 'Middleware via http.Handler: the interface is small (ISP), new middleware is added without modifying existing ones (OCP).' },
    difficulty: 'intermediate' as const,
    tags: ['solid', 'ocp', 'isp', 'middleware'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Как управлять графом зависимостей при соблюдении DIP?', en: 'How do you manage the dependency graph while following DIP?' },
    options: {
      ru: ['Через composition root — точку сборки в main/cmd', 'Через глобальные переменные', 'Через пакет init() функции', 'Через cyclic imports между пакетами'],
      en: ['Through a composition root — the assembly point in main/cmd', 'Through global variables', 'Through package init() functions', 'Through cyclic imports between packages'],
    },
    correct: 0 as const,
    explanation: { ru: 'Composition root (обычно в main) — место, где создаются и связываются все зависимости через интерфейсы.', en: 'The composition root (usually in main) is where all dependencies are created and wired together through interfaces.' },
    difficulty: 'intermediate' as const,
    tags: ['solid', 'dip', 'composition-root'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-solid', quizId: null,
    question: { ru: 'Какой принцип SOLID нарушается, если замена реализации интерфейса ломает программу?', en: 'Which SOLID principle is violated if replacing an interface implementation breaks the program?' },
    options: {
      ru: ['LSP — реализация не соблюдает контракт', 'OCP — программа не открыта для расширения', 'ISP — интерфейс слишком большой', 'SRP — слишком много ответственностей'],
      en: ['LSP — the implementation does not honor the contract', 'OCP — the program is not open for extension', 'ISP — the interface is too large', 'SRP — too many responsibilities'],
    },
    correct: 0 as const,
    explanation: { ru: 'Если новая реализация интерфейса ломает программу, значит она не соблюдает контракт — нарушение LSP.', en: 'If a new interface implementation breaks the program, it does not honor the contract — an LSP violation.' },
    difficulty: 'intermediate' as const,
    tags: ['solid', 'lsp', 'contract'],
  },
]

// ── OOP: Design Patterns (20 questions) ───────────────────────────────────
const questionsOopPatterns: BilingualQuestion[] = [
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Как реализуется Singleton в Go?', en: 'How is Singleton implemented in Go?' },
    options: {
      ru: ['Через sync.Once и приватную переменную пакета', 'Через ключевое слово singleton', 'Через глобальную переменную без защиты', 'Через init() функцию'],
      en: ['Via sync.Once and a package-private variable', 'Via the singleton keyword', 'Via a global variable without protection', 'Via the init() function'],
    },
    correct: 0 as const,
    explanation: { ru: 'sync.Once гарантирует, что инициализация произойдёт ровно один раз, даже при конкурентном доступе.', en: 'sync.Once guarantees initialization happens exactly once, even with concurrent access.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'singleton', 'sync-once'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Что такое Factory Function в Go?', en: 'What is a Factory Function in Go?' },
    options: {
      ru: ['Функция NewXxx, возвращающая инициализированный экземпляр типа', 'Метод, создающий подтипы', 'Интерфейс для создания объектов', 'Функция, принимающая interface{} и возвращающая конкретный тип'],
      en: ['A NewXxx function that returns an initialized instance of a type', 'A method that creates subtypes', 'An interface for creating objects', 'A function accepting interface{} and returning a concrete type'],
    },
    correct: 0 as const,
    explanation: { ru: 'В Go паттерн Factory реализуется через функции-конструкторы NewXxx, которые возвращают готовый к использованию экземпляр.', en: 'In Go, the Factory pattern is implemented via NewXxx constructor functions that return a ready-to-use instance.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'factory', 'constructor'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Как реализуется паттерн Builder в Go?', en: 'How is the Builder pattern implemented in Go?' },
    options: {
      ru: ['Через цепочку методов (method chaining), возвращающих *Builder', 'Через наследование от базового Builder', 'Через пакет builtin', 'Через отдельный пакет builder'],
      en: ['Via method chaining, where methods return *Builder', 'Via inheritance from a base Builder', 'Via the builtin package', 'Via a separate builder package'],
    },
    correct: 0 as const,
    explanation: { ru: 'Builder в Go реализуется через методы, возвращающие указатель на builder, что позволяет цепочку вызовов.', en: 'Builder in Go is implemented via methods returning a pointer to the builder, enabling method chaining.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'builder', 'method-chaining'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Как реализуется паттерн Decorator в Go?', en: 'How is the Decorator pattern implemented in Go?' },
    options: {
      ru: ['Через обёртку, реализующую тот же интерфейс и делегирующую вызовы', 'Через ключевое слово decorate', 'Через множественное наследование', 'Через аннотации (annotations)'],
      en: ['Via a wrapper implementing the same interface and delegating calls', 'Via the decorate keyword', 'Via multiple inheritance', 'Via annotations'],
    },
    correct: 0 as const,
    explanation: { ru: 'Decorator оборачивает объект, реализуя тот же интерфейс, добавляя поведение до/после делегации.', en: 'Decorator wraps an object, implementing the same interface, adding behavior before/after delegation.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'decorator', 'wrapper'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Как реализуется паттерн Observer в Go?', en: 'How is the Observer pattern implemented in Go?' },
    options: {
      ru: ['Через каналы (channels) для уведомления подписчиков', 'Через ключевое слово observe', 'Через callback-URL', 'Через пакет observer из stdlib'],
      en: ['Via channels to notify subscribers', 'Via the observe keyword', 'Via callback URLs', 'Via the observer package from stdlib'],
    },
    correct: 0 as const,
    explanation: { ru: 'В Go паттерн Observer естественно реализуется через каналы: publisher отправляет события, subscribers читают из каналов.', en: 'In Go, the Observer pattern is naturally implemented via channels: a publisher sends events, subscribers read from channels.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'observer', 'channels'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Как реализуется паттерн Strategy в Go?', en: 'How is the Strategy pattern implemented in Go?' },
    options: {
      ru: ['Через интерфейс с методом, представляющим алгоритм, и подмену реализации', 'Через switch по строке-имени стратегии', 'Через наследование от абстрактного класса', 'Через пакет strategy из stdlib'],
      en: ['Via an interface with a method representing the algorithm and swapping implementations', 'Via a switch on a strategy name string', 'Via inheritance from an abstract class', 'Via the strategy package from stdlib'],
    },
    correct: 0 as const,
    explanation: { ru: 'Strategy: определяем интерфейс для алгоритма, передаём разные реализации — поведение меняется без изменения клиента.', en: 'Strategy: define an interface for the algorithm, pass different implementations — behavior changes without modifying the client.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'strategy', 'interface'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Как реализуется паттерн Adapter в Go?', en: 'How is the Adapter pattern implemented in Go?' },
    options: {
      ru: ['Структура-обёртка хранит адаптируемый тип и реализует нужный интерфейс', 'Через type alias', 'Через приведение типов (type casting)', 'Через пакет adapter из stdlib'],
      en: ['A wrapper struct holds the adapted type and implements the required interface', 'Via type alias', 'Via type casting', 'Via the adapter package from stdlib'],
    },
    correct: 0 as const,
    explanation: { ru: 'Adapter: структура хранит "старый" объект и реализует новый интерфейс, транслируя вызовы.', en: 'Adapter: a struct holds the "old" object and implements the new interface, translating calls.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'adapter', 'wrapper'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Что такое паттерн Functional Options в Go?', en: 'What is the Functional Options pattern in Go?' },
    options: {
      ru: ['Конструктор принимает variadic функции-опции типа func(*Config)', 'Функция принимает map[string]interface{} с опциями', 'Использование builder для настройки', 'Чтение опций из конфигурационного файла'],
      en: ['A constructor accepts variadic option functions of type func(*Config)', 'A function accepts map[string]interface{} with options', 'Using a builder for configuration', 'Reading options from a config file'],
    },
    correct: 0 as const,
    explanation: { ru: 'Functional Options: NewServer(opts ...Option), где Option = func(*Config). Расширяемо и чисто.', en: 'Functional Options: NewServer(opts ...Option), where Option = func(*Config). Extensible and clean.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'functional-options'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Как реализуется паттерн Command в Go?', en: 'How is the Command pattern implemented in Go?' },
    options: {
      ru: ['Через интерфейс с методом Execute() и очередь команд', 'Через строковые команды в канале', 'Через exec.Command из stdlib', 'Через паттерн pub/sub'],
      en: ['Via an interface with an Execute() method and a command queue', 'Via string commands in a channel', 'Via exec.Command from stdlib', 'Via the pub/sub pattern'],
    },
    correct: 0 as const,
    explanation: { ru: 'Command: интерфейс с Execute(), каждая команда — отдельная структура. Позволяет очередь, undo, логирование.', en: 'Command: an interface with Execute(), each command is a separate struct. Enables queuing, undo, logging.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'command'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Как реализуется Template Method через встраивание в Go?', en: 'How is Template Method implemented via embedding in Go?' },
    options: {
      ru: ['Базовая структура определяет алгоритм, встраивающая — переопределяет шаги', 'Через дженерики с type constraints', 'Через ключевое слово override', 'Через абстрактный класс'],
      en: ['A base struct defines the algorithm, the embedding struct overrides steps', 'Via generics with type constraints', 'Via the override keyword', 'Via an abstract class'],
    },
    correct: 0 as const,
    explanation: { ru: 'В Go Template Method эмулируется через встраивание: базовый тип определяет "скелет", а встраивающий тип переопределяет (shadows) методы-шаги.', en: 'In Go, Template Method is emulated via embedding: the base type defines the "skeleton", and the embedding type overrides (shadows) step methods.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'template-method', 'embedding'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Как работает паттерн Middleware chain в Go?', en: 'How does the Middleware chain pattern work in Go?' },
    options: {
      ru: ['Каждый middleware принимает http.Handler и возвращает http.Handler', 'Middleware регистрируются в массиве и вызываются по индексу', 'Middleware связываются через каналы', 'Middleware компилируются в отдельные бинарники'],
      en: ['Each middleware takes an http.Handler and returns an http.Handler', 'Middleware are registered in an array and called by index', 'Middleware are connected via channels', 'Middleware are compiled into separate binaries'],
    },
    correct: 0 as const,
    explanation: { ru: 'Middleware в Go: func(next http.Handler) http.Handler — каждый оборачивает следующий, образуя цепочку.', en: 'Middleware in Go: func(next http.Handler) http.Handler — each wraps the next, forming a chain.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'middleware', 'http-handler'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Что такое паттерн Repository в Go?', en: 'What is the Repository pattern in Go?' },
    options: {
      ru: ['Интерфейс абстрагирует доступ к хранилищу данных', 'Шаблон для структуры git-репозитория', 'Способ организации пакетов', 'Паттерн кеширования данных'],
      en: ['An interface abstracts access to a data store', 'A template for git repository structure', 'A way to organize packages', 'A data caching pattern'],
    },
    correct: 0 as const,
    explanation: { ru: 'Repository: интерфейс (Find, Create, Update, Delete) абстрагирует хранилище. Бизнес-логика не знает о БД.', en: 'Repository: an interface (Find, Create, Update, Delete) abstracts the store. Business logic is unaware of the DB.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'repository', 'clean-architecture'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Как работает паттерн Option (WithXxx функции)?', en: 'How does the Option pattern (WithXxx functions) work?' },
    options: {
      ru: ['WithXxx возвращает функцию-опцию, модифицирующую конфигурацию', 'WithXxx — это метод на структуре Config', 'WithXxx создаёт новый экземпляр с изменённым полем', 'WithXxx — встроенная функция Go'],
      en: ['WithXxx returns an option function that modifies the config', 'WithXxx is a method on the Config struct', 'WithXxx creates a new instance with a changed field', 'WithXxx is a built-in Go function'],
    },
    correct: 0 as const,
    explanation: { ru: 'WithTimeout(d) возвращает func(*Config) { c.timeout = d }. Конструктор применяет все опции к дефолтному конфигу.', en: 'WithTimeout(d) returns func(*Config) { c.timeout = d }. The constructor applies all options to the default config.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'functional-options', 'with-pattern'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Что такое table-driven паттерн в Go?', en: 'What is the table-driven pattern in Go?' },
    options: {
      ru: ['Тестовые случаи и данные хранятся в слайсе структур и итерируются в цикле', 'Данные хранятся в SQL таблицах', 'Паттерн маршрутизации HTTP', 'Структура данных для хеш-таблиц'],
      en: ['Test cases and data are stored in a slice of structs and iterated in a loop', 'Data is stored in SQL tables', 'An HTTP routing pattern', 'A data structure for hash tables'],
    },
    correct: 0 as const,
    explanation: { ru: 'Table-driven: массив структур {name, input, expected} + range-цикл. Стандартный подход к тестированию в Go.', en: 'Table-driven: a slice of structs {name, input, expected} + range loop. The standard approach to testing in Go.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'table-driven', 'testing'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Как реализуется Iterator в Go 1.23+?', en: 'How is Iterator implemented in Go 1.23+?' },
    options: {
      ru: ['Через range over function (iter.Seq, iter.Seq2)', 'Через интерфейс Iterator с методами Next и Value', 'Через каналы', 'Через пакет container/list'],
      en: ['Via range over function (iter.Seq, iter.Seq2)', 'Via an Iterator interface with Next and Value methods', 'Via channels', 'Via the container/list package'],
    },
    correct: 0 as const,
    explanation: { ru: 'Go 1.23 добавил range over function: функция вида func(yield func(V) bool) используется в for range.', en: 'Go 1.23 added range over function: a function of the form func(yield func(V) bool) is used in for range.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'iterator', 'go-1.23'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'В чём отличие Decorator от Adapter?', en: 'What is the difference between Decorator and Adapter?' },
    options: {
      ru: ['Decorator добавляет поведение к тому же интерфейсу, Adapter преобразует один интерфейс в другой', 'Decorator работает с функциями, Adapter — со структурами', 'Decorator быстрее Adapter', 'Adapter — частный случай Decorator'],
      en: ['Decorator adds behavior to the same interface, Adapter converts one interface to another', 'Decorator works with functions, Adapter with structs', 'Decorator is faster than Adapter', 'Adapter is a special case of Decorator'],
    },
    correct: 0 as const,
    explanation: { ru: 'Decorator оборачивает и расширяет поведение того же интерфейса. Adapter адаптирует один интерфейс под другой.', en: 'Decorator wraps and extends behavior of the same interface. Adapter adapts one interface to another.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'decorator', 'adapter'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Почему Singleton считается антипаттерном в контексте тестирования?', en: 'Why is Singleton considered an antipattern in the context of testing?' },
    options: {
      ru: ['Глобальное состояние затрудняет изоляцию тестов', 'Singleton не поддерживается в Go', 'sync.Once работает некорректно в тестах', 'Singleton замедляет тесты'],
      en: ['Global state makes test isolation difficult', 'Singleton is not supported in Go', 'sync.Once works incorrectly in tests', 'Singleton slows down tests'],
    },
    correct: 0 as const,
    explanation: { ru: 'Singleton создаёт глобальное состояние, из-за которого тесты зависят друг от друга и не могут работать параллельно.', en: 'Singleton creates global state, causing tests to depend on each other and preventing parallel execution.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'singleton', 'testing', 'antipattern'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Как http.HandlerFunc реализует паттерн Adapter?', en: 'How does http.HandlerFunc implement the Adapter pattern?' },
    options: {
      ru: ['Преобразует обычную функцию func(w, r) в интерфейс http.Handler', 'Адаптирует HTTP/1.1 к HTTP/2', 'Оборачивает middleware в цепочку', 'Преобразует JSON в HTTP ответ'],
      en: ['Converts a regular func(w, r) to the http.Handler interface', 'Adapts HTTP/1.1 to HTTP/2', 'Wraps middleware into a chain', 'Converts JSON to HTTP response'],
    },
    correct: 0 as const,
    explanation: { ru: 'http.HandlerFunc — type adapter: тип-функция с методом ServeHTTP, превращающий обычную функцию в http.Handler.', en: 'http.HandlerFunc is a type adapter: a function type with a ServeHTTP method, turning a regular function into http.Handler.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'adapter', 'http-handler'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Какой паттерн используется при sort.Slice(s, less)?', en: 'Which pattern is used in sort.Slice(s, less)?' },
    options: {
      ru: ['Strategy — функция less определяет алгоритм сравнения', 'Observer — sort уведомляет о перестановках', 'Command — less — это команда', 'Factory — sort создаёт новый слайс'],
      en: ['Strategy — the less function defines the comparison algorithm', 'Observer — sort notifies about swaps', 'Command — less is a command', 'Factory — sort creates a new slice'],
    },
    correct: 0 as const,
    explanation: { ru: 'sort.Slice принимает стратегию сравнения (функцию less), позволяя сортировать по любому критерию — паттерн Strategy.', en: 'sort.Slice accepts a comparison strategy (less function), allowing sorting by any criterion — the Strategy pattern.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'strategy', 'sort'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-patterns', quizId: null,
    question: { ru: 'Какой паттерн реализует context.Context в Go?', en: 'Which pattern does context.Context implement in Go?' },
    options: {
      ru: ['Chain of Responsibility — контексты вкладываются друг в друга, формируя цепочку', 'Singleton — один контекст на приложение', 'Observer — контекст уведомляет о событиях', 'Factory — контекст создаёт дочерние объекты'],
      en: ['Chain of Responsibility — contexts nest into each other, forming a chain', 'Singleton — one context per application', 'Observer — context notifies about events', 'Factory — context creates child objects'],
    },
    correct: 0 as const,
    explanation: { ru: 'context.Context образует цепочку: Background → WithCancel → WithTimeout → WithValue. Каждый уровень добавляет функциональность.', en: 'context.Context forms a chain: Background → WithCancel → WithTimeout → WithValue. Each level adds functionality.' },
    difficulty: 'intermediate' as const,
    tags: ['patterns', 'context', 'chain-of-responsibility'],
  },
]

// ── OOP: Composition & Embedding (20 questions) ──────────────────────────
const questionsOopEmbedding: BilingualQuestion[] = [
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Чем отличается value receiver от pointer receiver в Go?', en: 'What is the difference between a value receiver and a pointer receiver in Go?' },
    options: {
      ru: ['Value receiver работает с копией, pointer receiver — с оригиналом', 'Value receiver быстрее', 'Pointer receiver нельзя использовать со структурами', 'Нет разницы в поведении'],
      en: ['Value receiver works with a copy, pointer receiver works with the original', 'Value receiver is faster', 'Pointer receiver cannot be used with structs', 'No difference in behavior'],
    },
    correct: 0 as const,
    explanation: { ru: 'Value receiver получает копию значения, pointer receiver — указатель на оригинал и может его изменять.', en: 'A value receiver gets a copy of the value, a pointer receiver gets a pointer to the original and can modify it.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'receivers', 'value-vs-pointer'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Какие методы входят в method set типа T (не *T)?', en: 'Which methods are in the method set of type T (not *T)?' },
    options: {
      ru: ['Только методы с value receiver', 'Методы с value и pointer receiver', 'Только методы с pointer receiver', 'Все методы из встроенных типов'],
      en: ['Only methods with value receiver', 'Methods with both value and pointer receiver', 'Only methods with pointer receiver', 'All methods from embedded types'],
    },
    correct: 0 as const,
    explanation: { ru: 'Method set типа T включает только методы с value receiver. Method set *T включает и value, и pointer receiver методы.', en: 'The method set of type T includes only value receiver methods. The method set of *T includes both value and pointer receiver methods.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'method-set', 'receivers'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Что такое встраивание (embedding) структур в Go?', en: 'What is struct embedding in Go?' },
    options: {
      ru: ['Включение одного типа в другой без указания имени поля', 'Наследование от базового класса', 'Композиция через указатели', 'Объединение двух типов в один через merge'],
      en: ['Including one type in another without specifying a field name', 'Inheriting from a base class', 'Composition via pointers', 'Merging two types into one via merge'],
    },
    correct: 0 as const,
    explanation: { ru: 'Встраивание — объявление типа как анонимного поля: type Outer struct { Inner }. Методы Inner продвигаются в Outer.', en: 'Embedding — declaring a type as an anonymous field: type Outer struct { Inner }. Methods of Inner are promoted to Outer.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'struct-embedding'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Что происходит при продвижении методов (method promotion) при встраивании?', en: 'What happens with method promotion during embedding?' },
    options: {
      ru: ['Методы встроенного типа становятся доступны на внешнем типе', 'Методы копируются в исходный код внешнего типа', 'Создаётся виртуальная таблица методов', 'Методы теряют свой receiver'],
      en: ['Methods of the embedded type become accessible on the outer type', 'Methods are copied into the source code of the outer type', 'A virtual method table is created', 'Methods lose their receiver'],
    },
    correct: 0 as const,
    explanation: { ru: 'Продвинутые методы вызываются через outer.Method(), но receiver остаётся типом inner.', en: 'Promoted methods are called via outer.Method(), but the receiver remains the inner type.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'method-promotion'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Как Go разрешает конфликт имён при множественном встраивании?', en: 'How does Go resolve name conflicts with multiple embedding?' },
    options: {
      ru: ['Вызов неоднозначного метода вызывает ошибку компиляции', 'Побеждает первый встроенный тип', 'Побеждает последний встроенный тип', 'Конфликты невозможны при встраивании'],
      en: ['Calling an ambiguous method causes a compilation error', 'The first embedded type wins', 'The last embedded type wins', 'Conflicts are impossible with embedding'],
    },
    correct: 0 as const,
    explanation: { ru: 'При неоднозначности компилятор требует явного указания: outer.TypeA.Method() или outer.TypeB.Method().', en: 'When ambiguous, the compiler requires explicit qualification: outer.TypeA.Method() or outer.TypeB.Method().' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'multiple-embedding', 'ambiguity'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Что такое shadowing метода при встраивании?', en: 'What is method shadowing with embedding?' },
    options: {
      ru: ['Внешний тип определяет метод с тем же именем, скрывая продвинутый', 'Метод автоматически переопределяется при встраивании', 'Компилятор удаляет дублирующиеся методы', 'Метод вызывается через рефлексию'],
      en: ['The outer type defines a method with the same name, hiding the promoted one', 'A method is automatically overridden during embedding', 'The compiler removes duplicate methods', 'A method is called via reflection'],
    },
    correct: 0 as const,
    explanation: { ru: 'Если Outer определяет Method(), он скрывает (shadows) продвинутый Inner.Method(). Оригинал доступен через outer.Inner.Method().', en: 'If Outer defines Method(), it shadows the promoted Inner.Method(). The original is accessible via outer.Inner.Method().' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'shadowing'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Можно ли встраивать интерфейсы в структуры?', en: 'Can you embed interfaces in structs?' },
    options: {
      ru: ['Да, структура автоматически удовлетворяет встроенному интерфейсу', 'Нет, это вызывает ошибку компиляции', 'Только если интерфейс содержит один метод', 'Только через указатель на интерфейс'],
      en: ['Yes, the struct automatically satisfies the embedded interface', 'No, it causes a compilation error', 'Only if the interface has one method', 'Only via a pointer to the interface'],
    },
    correct: 0 as const,
    explanation: { ru: 'Встроенный интерфейс даёт структуре все его методы. Но вызов без инициализации поля приведёт к panic (nil pointer).', en: 'An embedded interface gives the struct all its methods. But calling without initializing the field will cause a panic (nil pointer).' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'interface-embedding'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Чем встраивание отличается от наследования?', en: 'How does embedding differ from inheritance?' },
    options: {
      ru: ['Встраивание — это композиция: нет полиморфизма "is-a", только делегация', 'Встраивание — это наследование с другим синтаксисом', 'Встраивание поддерживает virtual dispatch', 'В Go встраивание и наследование — синонимы'],
      en: ['Embedding is composition: no "is-a" polymorphism, only delegation', 'Embedding is inheritance with different syntax', 'Embedding supports virtual dispatch', 'In Go, embedding and inheritance are synonyms'],
    },
    correct: 0 as const,
    explanation: { ru: 'Встраивание в Go — это has-a (композиция), не is-a (наследование). Нет виртуальных методов и dynamic dispatch.', en: 'Embedding in Go is has-a (composition), not is-a (inheritance). There are no virtual methods or dynamic dispatch.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'composition-vs-inheritance'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Что произойдёт при встраивании структуры с неэкспортированными полями из другого пакета?', en: 'What happens when embedding a struct with unexported fields from another package?' },
    options: {
      ru: ['Поля недоступны, но экспортированные методы работают', 'Ошибка компиляции', 'Все поля становятся экспортированными', 'Неэкспортированные поля становятся доступны через рефлексию'],
      en: ['Fields are inaccessible, but exported methods work', 'Compilation error', 'All fields become exported', 'Unexported fields become accessible via reflection'],
    },
    correct: 0 as const,
    explanation: { ru: 'Неэкспортированные поля встроенного типа недоступны в другом пакете, но экспортированные методы продвигаются нормально.', en: 'Unexported fields of the embedded type are inaccessible from another package, but exported methods are promoted normally.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'unexported', 'visibility'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Как влияет pointer receiver на удовлетворение интерфейса?', en: 'How does a pointer receiver affect interface satisfaction?' },
    options: {
      ru: ['Метод с pointer receiver входит только в method set *T, не T', 'Pointer receiver не влияет на удовлетворение интерфейса', 'Метод с pointer receiver входит в method set и T, и *T', 'Pointer receiver запрещает реализацию интерфейсов'],
      en: ['A method with pointer receiver is only in the method set of *T, not T', 'Pointer receiver does not affect interface satisfaction', 'A method with pointer receiver is in the method set of both T and *T', 'Pointer receiver prevents interface implementation'],
    },
    correct: 0 as const,
    explanation: { ru: 'Если метод определён на *T, то только *T удовлетворяет интерфейсу. T (значение) — нет. Частая ошибка у новичков.', en: 'If a method is defined on *T, only *T satisfies the interface. T (value) does not. A common mistake for beginners.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'method-set', 'interface-satisfaction'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Чем анонимное поле отличается от именованного?', en: 'How does an anonymous field differ from a named field?' },
    options: {
      ru: ['Анонимное поле продвигает методы и поля, именованное — нет', 'Именованное поле выделяет больше памяти', 'Анонимное поле всегда является указателем', 'Нет разницы в поведении'],
      en: ['An anonymous field promotes methods and fields, a named field does not', 'A named field allocates more memory', 'An anonymous field is always a pointer', 'No difference in behavior'],
    },
    correct: 0 as const,
    explanation: { ru: 'type S struct { T } — анонимное поле (embedding, promotion). type S struct { t T } — именованное (без promotion).', en: 'type S struct { T } — anonymous field (embedding, promotion). type S struct { t T } — named (no promotion).' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'anonymous-field', 'named-field'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Как встраивание интерфейсов используется для композиции интерфейсов?', en: 'How is interface embedding used for interface composition?' },
    options: {
      ru: ['Интерфейс включает методы встроенного интерфейса: type ReadWriter interface { Reader; Writer }', 'Через ключевое слово extends', 'Через дженерики', 'Через union типов'],
      en: ['An interface includes methods of the embedded interface: type ReadWriter interface { Reader; Writer }', 'Via the extends keyword', 'Via generics', 'Via union types'],
    },
    correct: 0 as const,
    explanation: { ru: 'io.ReadWriter = io.Reader + io.Writer. Встраивание интерфейсов — основной способ композиции в Go.', en: 'io.ReadWriter = io.Reader + io.Writer. Interface embedding is the primary composition method in Go.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'interface-composition'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Какой receiver рекомендуется для метода, изменяющего состояние структуры?', en: 'Which receiver is recommended for a method that modifies struct state?' },
    options: {
      ru: ['Pointer receiver (*T)', 'Value receiver (T)', 'Любой, компилятор разберётся', 'Зависит от размера структуры'],
      en: ['Pointer receiver (*T)', 'Value receiver (T)', 'Either, the compiler will figure it out', 'Depends on the struct size'],
    },
    correct: 0 as const,
    explanation: { ru: 'Мутирующие методы должны использовать pointer receiver, иначе изменения применятся к копии и будут потеряны.', en: 'Mutating methods must use a pointer receiver, otherwise changes apply to a copy and are lost.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'receivers', 'mutation'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Можно ли встроить указатель на структуру?', en: 'Can you embed a pointer to a struct?' },
    options: {
      ru: ['Да: type Outer struct { *Inner } — методы Inner продвигаются', 'Нет, встраивание работает только с value типами', 'Да, но методы не продвигаются', 'Только для интерфейсов'],
      en: ['Yes: type Outer struct { *Inner } — methods of Inner are promoted', 'No, embedding only works with value types', 'Yes, but methods are not promoted', 'Only for interfaces'],
    },
    correct: 0 as const,
    explanation: { ru: 'Встраивание *Inner допустимо. Методы продвигаются, но нужно инициализировать указатель, иначе — nil panic.', en: 'Embedding *Inner is valid. Methods are promoted, but you need to initialize the pointer, otherwise — nil panic.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'pointer-embedding'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Почему в Go нет ключевого слова override?', en: 'Why is there no override keyword in Go?' },
    options: {
      ru: ['Потому что Go не поддерживает наследование — shadowing заменяет override', 'override планируется в Go 2', 'override не нужен из-за дженериков', 'override заменён ключевым словом embed'],
      en: ['Because Go does not support inheritance — shadowing replaces override', 'override is planned for Go 2', 'override is unnecessary due to generics', 'override is replaced by the embed keyword'],
    },
    correct: 0 as const,
    explanation: { ru: 'В Go нет наследования, поэтому нет и override. Встраивание использует shadowing — внешний метод скрывает внутренний.', en: 'Go has no inheritance, hence no override. Embedding uses shadowing — the outer method hides the inner one.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'override', 'shadowing'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Когда стоит использовать value receiver?', en: 'When should you use a value receiver?' },
    options: {
      ru: ['Когда метод не изменяет состояние и структура маленькая', 'Всегда — это безопаснее', 'Только для примитивных типов', 'Когда структура содержит указатели'],
      en: ['When the method does not modify state and the struct is small', 'Always — it is safer', 'Only for primitive types', 'When the struct contains pointers'],
    },
    correct: 0 as const,
    explanation: { ru: 'Value receiver подходит для read-only методов на маленьких структурах. Для больших — pointer, чтобы избежать копирования.', en: 'Value receiver suits read-only methods on small structs. For large ones — pointer, to avoid copying.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'receivers', 'best-practices'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Что произойдёт, если структура с sync.Mutex встраивает его как значение и копируется?', en: 'What happens if a struct embedding sync.Mutex as a value is copied?' },
    options: {
      ru: ['Мьютекс будет скопирован, что приведёт к data race / deadlock', 'Go автоматически разделяет мьютекс', 'Компилятор запретит копирование', 'Ничего плохого не произойдёт'],
      en: ['The mutex will be copied, leading to data race / deadlock', 'Go automatically shares the mutex', 'The compiler will forbid copying', 'Nothing bad will happen'],
    },
    correct: 0 as const,
    explanation: { ru: 'Копирование sync.Mutex — серьёзная ошибка: копия может быть заблокирована, и vet/copylocks предупреждает об этом.', en: 'Copying sync.Mutex is a serious error: the copy may be locked, and vet/copylocks warns about this.' },
    difficulty: 'intermediate' as const,
    tags: ['embedding', 'sync-mutex', 'copy'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Как достичь полиморфизма в Go без наследования?', en: 'How do you achieve polymorphism in Go without inheritance?' },
    options: {
      ru: ['Через интерфейсы: разные типы реализуют один интерфейс', 'Через embedding и virtual dispatch', 'Через рефлексию и type assertion', 'Через дженерики и type constraints'],
      en: ['Via interfaces: different types implement the same interface', 'Via embedding and virtual dispatch', 'Via reflection and type assertion', 'Via generics and type constraints'],
    },
    correct: 0 as const,
    explanation: { ru: 'Полиморфизм в Go — через интерфейсы. Любой тип, реализующий интерфейс, может быть подставлен. Классического наследования нет.', en: 'Polymorphism in Go is via interfaces. Any type implementing the interface can be substituted. There is no classical inheritance.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'polymorphism', 'interfaces'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Каково правило consistency для receivers в Go?', en: 'What is the receiver consistency rule in Go?' },
    options: {
      ru: ['Все методы типа должны использовать одинаковый тип receiver', 'Value и pointer receivers можно свободно смешивать', 'Consistency rule существует только для интерфейсов', 'Compiler enforces automatic consistency'],
      en: ['All methods of a type should use the same receiver type', 'Value and pointer receivers can be freely mixed', 'The consistency rule exists only for interfaces', 'The compiler enforces automatic consistency'],
    },
    correct: 0 as const,
    explanation: { ru: 'Рекомендация Go: если хотя бы один метод требует pointer receiver, все методы типа должны использовать pointer receiver для consistency.', en: 'Go recommendation: if at least one method requires a pointer receiver, all methods of the type should use pointer receiver for consistency.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'receivers', 'consistency'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-embedding', quizId: null,
    question: { ru: 'Что такое метод на типе-функции в Go?', en: 'What is a method on a function type in Go?' },
    options: {
      ru: ['Тип-функция может иметь методы, например http.HandlerFunc имеет ServeHTTP', 'Функции не могут иметь методов в Go', 'Это alias для замыкания', 'Метод, принимающий func как параметр'],
      en: ['A function type can have methods, e.g. http.HandlerFunc has ServeHTTP', 'Functions cannot have methods in Go', 'It is an alias for a closure', 'A method that takes func as a parameter'],
    },
    correct: 0 as const,
    explanation: { ru: 'type HandlerFunc func(w, r) — именованный тип-функция, на котором определён метод ServeHTTP. Это adapter pattern.', en: 'type HandlerFunc func(w, r) — a named function type with a ServeHTTP method defined on it. This is the adapter pattern.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['embedding', 'function-type', 'methods'],
  },
]

// ── OOP: Dependency Injection (20 questions) ──────────────────────────────
const questionsOopDI: BilingualQuestion[] = [
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Что такое Dependency Injection (DI)?', en: 'What is Dependency Injection (DI)?' },
    options: {
      ru: ['Паттерн, при котором зависимости передаются извне, а не создаются внутри', 'Фреймворк для создания объектов', 'Способ кеширования зависимостей', 'Замена конструктора фабрикой'],
      en: ['A pattern where dependencies are passed from outside, not created internally', 'A framework for creating objects', 'A way to cache dependencies', 'Replacing a constructor with a factory'],
    },
    correct: 0 as const,
    explanation: { ru: 'DI: зависимости инжектируются (передаются) в конструктор/функцию, а не создаются внутри — улучшает тестируемость и гибкость.', en: 'DI: dependencies are injected (passed) into a constructor/function, not created internally — improves testability and flexibility.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'definition'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Как реализуется constructor injection в Go?', en: 'How is constructor injection implemented in Go?' },
    options: {
      ru: ['Конструктор NewXxx принимает интерфейсы зависимостей как параметры', 'Через аннотации @Inject', 'Через пакет reflect', 'Через метод SetDependency()'],
      en: ['The NewXxx constructor accepts dependency interfaces as parameters', 'Via @Inject annotations', 'Via the reflect package', 'Via a SetDependency() method'],
    },
    correct: 0 as const,
    explanation: { ru: 'func NewService(repo Repository, logger Logger) *Service — зависимости передаются через параметры конструктора.', en: 'func NewService(repo Repository, logger Logger) *Service — dependencies are passed via constructor parameters.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'constructor-injection'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Что такое functional injection в Go?', en: 'What is functional injection in Go?' },
    options: {
      ru: ['Передача функции (func) вместо интерфейса в качестве зависимости', 'Использование Functional Options паттерна', 'Инъекция через замыкания', 'Использование функции init()'],
      en: ['Passing a function (func) instead of an interface as a dependency', 'Using the Functional Options pattern', 'Injection via closures', 'Using the init() function'],
    },
    correct: 0 as const,
    explanation: { ru: 'Вместо интерфейса можно передать func: NewHandler(fetchUser func(id int) (User, error)) — проще для простых случаев.', en: 'Instead of an interface, you can pass a func: NewHandler(fetchUser func(id int) (User, error)) — simpler for simple cases.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'functional-injection'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Как создать mock (мок) для тестирования с DI в Go?', en: 'How do you create a mock for testing with DI in Go?' },
    options: {
      ru: ['Создать структуру, реализующую интерфейс зависимости, с заранее заданным поведением', 'Использовать ключевое слово mock', 'Через monkey-patching', 'Через пакет unsafe'],
      en: ['Create a struct implementing the dependency interface with predefined behavior', 'Use the mock keyword', 'Via monkey-patching', 'Via the unsafe package'],
    },
    correct: 0 as const,
    explanation: { ru: 'Mock в Go — это структура, реализующая интерфейс, с полями-функциями или фиксированными ответами для тестирования.', en: 'A mock in Go is a struct implementing the interface, with function fields or fixed responses for testing.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'mock', 'testing'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Чем mock отличается от stub?', en: 'What is the difference between a mock and a stub?' },
    options: {
      ru: ['Stub возвращает фиксированные данные, mock проверяет вызовы (expectations)', 'Mock быстрее stub', 'Stub используется только в integration tests', 'Нет разницы — это синонимы'],
      en: ['A stub returns fixed data, a mock verifies calls (expectations)', 'A mock is faster than a stub', 'A stub is only used in integration tests', 'No difference — they are synonyms'],
    },
    correct: 0 as const,
    explanation: { ru: 'Stub — возвращает заготовленные данные. Mock — ещё и проверяет, что определённые методы были вызваны с нужными аргументами.', en: 'A stub returns prepared data. A mock also verifies that certain methods were called with the expected arguments.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'mock', 'stub', 'testing'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Что такое google/wire?', en: 'What is google/wire?' },
    options: {
      ru: ['Инструмент для compile-time dependency injection через кодогенерацию', 'HTTP фреймворк от Google', 'Протокол для gRPC', 'Библиотека для работы с проводами (streams)'],
      en: ['A tool for compile-time dependency injection via code generation', 'An HTTP framework by Google', 'A protocol for gRPC', 'A library for working with streams'],
    },
    correct: 0 as const,
    explanation: { ru: 'google/wire генерирует код для DI на этапе компиляции. Безопасно типизированный, без runtime reflection.', en: 'google/wire generates DI code at compile time. Type-safe, no runtime reflection.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'wire', 'codegen'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Что такое uber/fx?', en: 'What is uber/fx?' },
    options: {
      ru: ['Runtime DI-контейнер, использующий рефлексию для разрешения зависимостей', 'Compile-time DI через кодогенерацию', 'Фреймворк для UI-разработки', 'Инструмент для форматирования кода'],
      en: ['A runtime DI container using reflection to resolve dependencies', 'Compile-time DI via code generation', 'A UI development framework', 'A code formatting tool'],
    },
    correct: 0 as const,
    explanation: { ru: 'uber/fx — DI-контейнер, который через рефлексию автоматически резолвит и инжектирует зависимости в runtime.', en: 'uber/fx is a DI container that automatically resolves and injects dependencies at runtime via reflection.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'fx', 'uber'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'В чём разница между google/wire и uber/fx?', en: 'What is the difference between google/wire and uber/fx?' },
    options: {
      ru: ['wire — compile-time (кодогенерация), fx — runtime (рефлексия)', 'wire — для микросервисов, fx — для монолитов', 'wire быстрее fx в 100 раз', 'fx не поддерживает интерфейсы'],
      en: ['wire is compile-time (codegen), fx is runtime (reflection)', 'wire is for microservices, fx is for monoliths', 'wire is 100x faster than fx', 'fx does not support interfaces'],
    },
    correct: 0 as const,
    explanation: { ru: 'wire генерирует код на этапе go generate — ошибки видны при компиляции. fx резолвит зависимости в runtime через reflect.', en: 'wire generates code during go generate — errors are visible at compile time. fx resolves dependencies at runtime via reflect.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'wire', 'fx', 'comparison'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Почему глобальное состояние (global state) мешает тестированию?', en: 'Why does global state hinder testing?' },
    options: {
      ru: ['Тесты становятся зависимыми друг от друга и не могут запускаться параллельно', 'Глобальные переменные запрещены в Go', 'go test не видит глобальные переменные', 'Глобальное состояние замедляет компиляцию'],
      en: ['Tests become dependent on each other and cannot run in parallel', 'Global variables are forbidden in Go', 'go test cannot see global variables', 'Global state slows down compilation'],
    },
    correct: 0 as const,
    explanation: { ru: 'Глобальное состояние делает тесты хрупкими: один тест меняет состояние, другой — ломается. Параллельное выполнение невозможно.', en: 'Global state makes tests brittle: one test changes state, another breaks. Parallel execution is impossible.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'global-state', 'testing'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Что такое антипаттерн Service Locator?', en: 'What is the Service Locator antipattern?' },
    options: {
      ru: ['Компонент сам ищет зависимости в глобальном реестре, вместо получения через конструктор', 'Паттерн для поиска микросервисов', 'Использование DNS для разрешения сервисов', 'Шаблон для логирования ошибок'],
      en: ['A component looks up dependencies in a global registry instead of receiving them via constructor', 'A pattern for discovering microservices', 'Using DNS for service resolution', 'A template for error logging'],
    },
    correct: 0 as const,
    explanation: { ru: 'Service Locator скрывает зависимости: из сигнатуры конструктора не видно, что нужно компоненту. DI — явнее.', en: 'Service Locator hides dependencies: the constructor signature does not reveal what the component needs. DI is more explicit.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'service-locator', 'antipattern'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Как DI применяется в HTTP-хендлерах Go?', en: 'How is DI applied in Go HTTP handlers?' },
    options: {
      ru: ['Хендлер — метод структуры, зависимости хранятся в полях структуры', 'Зависимости передаются через HTTP headers', 'Зависимости хранятся в context.Context', 'Хендлер сам создаёт подключение к БД'],
      en: ['A handler is a method of a struct, dependencies are stored in struct fields', 'Dependencies are passed via HTTP headers', 'Dependencies are stored in context.Context', 'The handler creates its own DB connection'],
    },
    correct: 0 as const,
    explanation: { ru: 'type Handler struct { repo Repo }; func (h *Handler) GetUser(w, r) — зависимости в полях, инжектируются через NewHandler.', en: 'type Handler struct { repo Repo }; func (h *Handler) GetUser(w, r) — dependencies in fields, injected via NewHandler.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'http-handler', 'struct'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Что такое config injection?', en: 'What is config injection?' },
    options: {
      ru: ['Передача конфигурации (struct/interface) в конструктор вместо чтения из env внутри', 'Запись конфига в env переменные', 'Динамическое изменение конфига в runtime', 'Хранение конфига в БД'],
      en: ['Passing configuration (struct/interface) into the constructor instead of reading env inside', 'Writing config to env variables', 'Dynamically changing config at runtime', 'Storing config in a database'],
    },
    correct: 0 as const,
    explanation: { ru: 'Config injection: конструктор принимает Config struct, а не вызывает os.Getenv внутри. Тестируемо и явно.', en: 'Config injection: the constructor accepts a Config struct, not calling os.Getenv inside. Testable and explicit.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'config', 'injection'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Как Clean Architecture использует DI?', en: 'How does Clean Architecture use DI?' },
    options: {
      ru: ['Внутренние слои зависят от интерфейсов, внешние — предоставляют реализации', 'Все слои используют одну глобальную переменную', 'DI не используется в Clean Architecture', 'Каждый слой создаёт свои зависимости'],
      en: ['Inner layers depend on interfaces, outer layers provide implementations', 'All layers use one global variable', 'DI is not used in Clean Architecture', 'Each layer creates its own dependencies'],
    },
    correct: 0 as const,
    explanation: { ru: 'В Clean Architecture бизнес-логика зависит от интерфейсов (ports), а инфраструктурный слой предоставляет реализации (adapters).', en: 'In Clean Architecture, business logic depends on interfaces (ports), and the infrastructure layer provides implementations (adapters).' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'clean-architecture', 'ports-adapters'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Как table-driven тесты используют DI?', en: 'How do table-driven tests use DI?' },
    options: {
      ru: ['Каждый test case предоставляет свой mock/stub зависимости', 'Table-driven тесты не используют DI', 'Зависимости создаются один раз для всех case', 'DI заменяет table-driven подход'],
      en: ['Each test case provides its own mock/stub dependency', 'Table-driven tests do not use DI', 'Dependencies are created once for all cases', 'DI replaces the table-driven approach'],
    },
    correct: 0 as const,
    explanation: { ru: 'В table-driven тестах каждый case может иметь свой mock: tests := []struct{ repo MockRepo; expected... }{...}.', en: 'In table-driven tests each case can have its own mock: tests := []struct{ repo MockRepo; expected... }{...}.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'table-driven', 'testing'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Что такое fake в контексте тестирования?', en: 'What is a fake in the context of testing?' },
    options: {
      ru: ['Рабочая реализация зависимости с упрощённой логикой (напр. in-memory DB)', 'Синоним для mock', 'Функция, которая всегда возвращает nil', 'Случайно сгенерированные тестовые данные'],
      en: ['A working implementation of a dependency with simplified logic (e.g. in-memory DB)', 'A synonym for mock', 'A function that always returns nil', 'Randomly generated test data'],
    },
    correct: 0 as const,
    explanation: { ru: 'Fake — упрощённая, но рабочая реализация. Например, in-memory repository вместо PostgreSQL для тестов.', en: 'A fake is a simplified but working implementation. For example, an in-memory repository instead of PostgreSQL for tests.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'fake', 'testing'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Какой подход к DI предпочтителен в небольших Go-проектах?', en: 'Which DI approach is preferable in small Go projects?' },
    options: {
      ru: ['Ручной DI через конструкторы (без фреймворков)', 'uber/fx', 'google/wire', 'Spring-like контейнер'],
      en: ['Manual DI via constructors (no frameworks)', 'uber/fx', 'google/wire', 'A Spring-like container'],
    },
    correct: 0 as const,
    explanation: { ru: 'Для небольших проектов ручной DI через конструкторы достаточен и не требует внешних зависимостей.', en: 'For small projects, manual DI via constructors is sufficient and requires no external dependencies.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'manual-di', 'best-practices'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Где должен находиться composition root в Go-приложении?', en: 'Where should the composition root be in a Go application?' },
    options: {
      ru: ['В func main() или cmd/ пакете', 'В каждом пакете отдельно', 'В пакете internal', 'В тестовых файлах'],
      en: ['In func main() or the cmd/ package', 'In each package separately', 'In the internal package', 'In test files'],
    },
    correct: 0 as const,
    explanation: { ru: 'Composition root — место в main/cmd, где создаются все зависимости и связываются вместе. Единая точка сборки.', en: 'The composition root is the place in main/cmd where all dependencies are created and wired together. A single assembly point.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'composition-root'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Почему в Go конструктор возвращает конкретный тип, а не интерфейс?', en: 'Why does a Go constructor return a concrete type, not an interface?' },
    options: {
      ru: ['"Accept interfaces, return structs" — потребитель определяет нужный интерфейс', 'Интерфейсы нельзя возвращать из функций', 'Компилятор запрещает возврат интерфейсов', 'Это улучшает производительность в 2 раза'],
      en: ['"Accept interfaces, return structs" — the consumer defines the needed interface', 'Interfaces cannot be returned from functions', 'The compiler forbids returning interfaces', 'This improves performance 2x'],
    },
    correct: 0 as const,
    explanation: { ru: 'Принцип "accept interfaces, return structs": конструктор возвращает конкретный тип, а потребитель решает, какой интерфейс использовать.', en: 'The "accept interfaces, return structs" principle: a constructor returns a concrete type, and the consumer decides which interface to use.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'accept-interfaces-return-structs'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Как избежать circular dependency при DI?', en: 'How do you avoid circular dependency with DI?' },
    options: {
      ru: ['Ввести общий интерфейс в третьем пакете, от которого зависят оба', 'Circular dependency невозможна в Go', 'Использовать import cycle через internal/', 'Передавать зависимости через глобальные переменные'],
      en: ['Introduce a common interface in a third package that both depend on', 'Circular dependency is impossible in Go', 'Use import cycle via internal/', 'Pass dependencies via global variables'],
    },
    correct: 0 as const,
    explanation: { ru: 'Go запрещает циклические импорты. Решение — интерфейс в отдельном пакете, разрывающий цикл зависимостей.', en: 'Go forbids cyclic imports. The solution is an interface in a separate package, breaking the dependency cycle.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'circular-dependency'],
  },
  {
    type: 'mcq' as const, blockId: 'oop-di', quizId: null,
    question: { ru: 'Как проверить в compile-time, что тип реализует интерфейс?', en: 'How do you verify at compile-time that a type implements an interface?' },
    options: {
      ru: ['var _ Interface = (*ConcreteType)(nil)', 'reflect.Implements(ConcreteType, Interface)', 'go vet --check-interface', 'Никак, только в runtime'],
      en: ['var _ Interface = (*ConcreteType)(nil)', 'reflect.Implements(ConcreteType, Interface)', 'go vet --check-interface', 'Not possible, only at runtime'],
    },
    correct: 0 as const,
    explanation: { ru: 'var _ Repository = (*pgRepo)(nil) — compile-time проверка: если pgRepo не реализует Repository, компиляция не пройдёт.', en: 'var _ Repository = (*pgRepo)(nil) — compile-time check: if pgRepo does not implement Repository, compilation fails.' },
    difficulty: 'intermediate' as const,
    tags: ['di', 'compile-time-check', 'interface'],
  },
]

// ── Concurrency: Goroutines (20 questions) ─────────────────────────────────
const questionsConcurrencyGoroutines: BilingualQuestion[] = [
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Как запустить горутину в Go?', en: 'How do you start a goroutine in Go?' },
    options: {
      ru: ['go f()', 'goroutine f()', 'async f()', 'spawn f()'],
      en: ['go f()', 'goroutine f()', 'async f()', 'spawn f()'],
    },
    correct: 0 as const,
    explanation: { ru: 'Ключевое слово go перед вызовом функции запускает горутину.', en: 'The go keyword before a function call starts a goroutine.' },
    difficulty: 'basic' as const,
    tags: ['goroutines', 'go-keyword'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Чем горутина отличается от потока ОС?', en: 'How does a goroutine differ from an OS thread?' },
    options: {
      ru: ['Горутина легче: начальный стек ~2-8 КБ, управляется рантаймом Go', 'Горутина — это просто обёртка над потоком ОС', 'Горутина всегда привязана к одному ядру CPU', 'Горутины не могут выполняться параллельно'],
      en: ['A goroutine is lighter: ~2-8 KB initial stack, managed by Go runtime', 'A goroutine is just a wrapper around an OS thread', 'A goroutine is always pinned to a single CPU core', 'Goroutines cannot run in parallel'],
    },
    correct: 0 as const,
    explanation: { ru: 'Горутины мультиплексируются поверх потоков ОС рантаймом Go. Начальный стек ~2-8 КБ (поток ОС ~1-8 МБ).', en: 'Goroutines are multiplexed onto OS threads by the Go runtime. Initial stack is ~2-8 KB (OS thread ~1-8 MB).' },
    difficulty: 'basic' as const,
    tags: ['goroutines', 'os-thread'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Какой начальный размер стека горутины в Go?', en: 'What is the initial stack size of a goroutine in Go?' },
    options: {
      ru: ['Около 2-8 КБ, стек растёт динамически', '1 МБ фиксированный', '64 КБ фиксированный', 'Зависит от GOMAXPROCS'],
      en: ['About 2-8 KB, stack grows dynamically', '1 MB fixed', '64 KB fixed', 'Depends on GOMAXPROCS'],
    },
    correct: 0 as const,
    explanation: { ru: 'Стек горутины начинается с ~2-8 КБ и увеличивается/уменьшается по мере необходимости (segmented/contiguous stack).', en: 'A goroutine stack starts at ~2-8 KB and grows/shrinks as needed (segmented/contiguous stack).' },
    difficulty: 'intermediate' as const,
    tags: ['goroutines', 'stack'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Что означает модель GMP в планировщике Go?', en: 'What does the GMP model in the Go scheduler stand for?' },
    options: {
      ru: ['G — горутина, M — системный поток, P — логический процессор', 'G — global, M — main, P — parallel', 'G — goroutine, M — memory, P — process', 'G — garbage, M — mutex, P — pool'],
      en: ['G — goroutine, M — OS thread, P — logical processor', 'G — global, M — main, P — parallel', 'G — goroutine, M — memory, P — process', 'G — garbage, M — mutex, P — pool'],
    },
    correct: 0 as const,
    explanation: { ru: 'В модели GMP: G (goroutine) — горутина, M (machine) — системный поток, P (processor) — логический процессор с очередью горутин.', en: 'In the GMP model: G (goroutine) — a goroutine, M (machine) — an OS thread, P (processor) — a logical processor with a goroutine queue.' },
    difficulty: 'intermediate' as const,
    tags: ['goroutines', 'gmp-scheduler'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Что задаёт GOMAXPROCS?', en: 'What does GOMAXPROCS control?' },
    options: {
      ru: ['Количество логических процессоров P, которые могут выполнять горутины одновременно', 'Максимальное число горутин', 'Максимальное число потоков ОС', 'Размер стека горутины'],
      en: ['The number of logical processors P that can execute goroutines simultaneously', 'The maximum number of goroutines', 'The maximum number of OS threads', 'The goroutine stack size'],
    },
    correct: 0 as const,
    explanation: { ru: 'GOMAXPROCS задаёт количество P. По умолчанию равно числу CPU-ядер. Можно изменить через runtime.GOMAXPROCS().', en: 'GOMAXPROCS sets the number of P. Defaults to the number of CPU cores. Can be changed via runtime.GOMAXPROCS().' },
    difficulty: 'intermediate' as const,
    tags: ['goroutines', 'gomaxprocs'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Что делает runtime.Gosched()?', en: 'What does runtime.Gosched() do?' },
    options: {
      ru: ['Уступает управление планировщику, позволяя другим горутинам выполниться', 'Завершает текущую горутину', 'Создаёт новую горутину', 'Блокирует горутину до получения сигнала'],
      en: ['Yields control to the scheduler, allowing other goroutines to run', 'Terminates the current goroutine', 'Creates a new goroutine', 'Blocks the goroutine until a signal is received'],
    },
    correct: 0 as const,
    explanation: { ru: 'runtime.Gosched() добровольно отдаёт процессорное время, чтобы планировщик мог запустить другие горутины.', en: 'runtime.Gosched() voluntarily yields CPU time so the scheduler can run other goroutines.' },
    difficulty: 'intermediate' as const,
    tags: ['goroutines', 'runtime', 'gosched'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Что такое утечка горутин (goroutine leak)?', en: 'What is a goroutine leak?' },
    options: {
      ru: ['Горутина, которая заблокирована навсегда и никогда не завершится', 'Горутина, которая использует слишком много памяти', 'Горутина, которая вызывает панику', 'Горутина, которая выполняется слишком долго'],
      en: ['A goroutine that is blocked forever and will never finish', 'A goroutine that uses too much memory', 'A goroutine that causes a panic', 'A goroutine that runs for too long'],
    },
    correct: 0 as const,
    explanation: { ru: 'Утечка горутин — горутина заблокирована (например, ожидает канал, который никто не закроет) и никогда не завершится, потребляя ресурсы.', en: 'A goroutine leak occurs when a goroutine is blocked (e.g., waiting on a channel nobody will close) and never terminates, consuming resources.' },
    difficulty: 'intermediate' as const,
    tags: ['goroutines', 'leak'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Для чего используется sync.WaitGroup?', en: 'What is sync.WaitGroup used for?' },
    options: {
      ru: ['Для ожидания завершения группы горутин', 'Для ограничения числа одновременных горутин', 'Для синхронизации доступа к разделяемой памяти', 'Для отмены группы горутин'],
      en: ['To wait for a group of goroutines to finish', 'To limit the number of concurrent goroutines', 'To synchronize access to shared memory', 'To cancel a group of goroutines'],
    },
    correct: 0 as const,
    explanation: { ru: 'sync.WaitGroup позволяет ожидать завершения набора горутин через Add(), Done() и Wait().', en: 'sync.WaitGroup allows waiting for a set of goroutines to complete via Add(), Done(), and Wait().' },
    difficulty: 'basic' as const,
    tags: ['goroutines', 'waitgroup'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Можно ли получить возвращаемое значение из горутины напрямую?', en: 'Can you get a return value from a goroutine directly?' },
    options: {
      ru: ['Нет, горутина не возвращает значение; используйте каналы или замыкания', 'Да, через go result := f()', 'Да, через goroutine.Result()', 'Да, через runtime.Return()'],
      en: ['No, a goroutine does not return a value; use channels or closures', 'Yes, via go result := f()', 'Yes, via goroutine.Result()', 'Yes, via runtime.Return()'],
    },
    correct: 0 as const,
    explanation: { ru: 'Выражение go f() не возвращает значения. Для получения результата используют каналы, замыкания или shared state с мьютексами.', en: 'The go f() expression does not return a value. Use channels, closures, or shared state with mutexes to get results.' },
    difficulty: 'basic' as const,
    tags: ['goroutines', 'return-value'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Что произойдёт, если main-горутина завершится, а другие горутины ещё работают?', en: 'What happens if the main goroutine exits while other goroutines are still running?' },
    options: {
      ru: ['Программа завершится, все горутины будут уничтожены', 'Программа будет ждать завершения всех горутин', 'Оставшиеся горутины станут демонами', 'Произойдёт паника'],
      en: ['The program exits, all goroutines are killed', 'The program waits for all goroutines to finish', 'Remaining goroutines become daemons', 'A panic occurs'],
    },
    correct: 0 as const,
    explanation: { ru: 'Когда main-горутина завершается, программа завершается немедленно, не дожидаясь других горутин.', en: 'When the main goroutine exits, the program terminates immediately without waiting for other goroutines.' },
    difficulty: 'basic' as const,
    tags: ['goroutines', 'main-exit'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'В каком порядке вызываются методы sync.WaitGroup?', en: 'In what order are sync.WaitGroup methods called?' },
    options: {
      ru: ['Add() перед запуском горутин, Done() в горутине, Wait() в вызывающем коде', 'Wait() первым, затем Add(), затем Done()', 'Done() первым, затем Add()', 'Порядок не важен'],
      en: ['Add() before launching goroutines, Done() in the goroutine, Wait() in the caller', 'Wait() first, then Add(), then Done()', 'Done() first, then Add()', 'The order does not matter'],
    },
    correct: 0 as const,
    explanation: { ru: 'Add() вызывается до запуска горутины, Done() — при завершении (обычно через defer), Wait() блокирует до обнуления счётчика.', en: 'Add() is called before launching the goroutine, Done() on completion (usually via defer), Wait() blocks until the counter reaches zero.' },
    difficulty: 'intermediate' as const,
    tags: ['goroutines', 'waitgroup', 'ordering'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Какой флаг go vet / go test обнаруживает гонки данных?', en: 'Which go vet / go test flag detects data races?' },
    options: {
      ru: ['-race', '-detect', '-concurrent', '-safe'],
      en: ['-race', '-detect', '-concurrent', '-safe'],
    },
    correct: 0 as const,
    explanation: { ru: 'Флаг -race включает встроенный race detector, который обнаруживает одновременный доступ к памяти без синхронизации.', en: 'The -race flag enables the built-in race detector that finds unsynchronized concurrent memory access.' },
    difficulty: 'basic' as const,
    tags: ['goroutines', 'race-detector'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Что такое data race в Go?', en: 'What is a data race in Go?' },
    options: {
      ru: ['Две горутины одновременно обращаются к одной переменной, и хотя бы одна пишет', 'Две горутины одновременно читают одну переменную', 'Горутина ждёт канал слишком долго', 'Горутина использует слишком много CPU'],
      en: ['Two goroutines access the same variable concurrently, and at least one writes', 'Two goroutines read the same variable concurrently', 'A goroutine waits on a channel for too long', 'A goroutine uses too much CPU'],
    },
    correct: 0 as const,
    explanation: { ru: 'Data race: ≥2 горутин обращаются к одной переменной, хотя бы одна пишет, без синхронизации. Поведение становится неопределённым.', en: 'Data race: ≥2 goroutines access the same variable, at least one writes, without synchronization. Behavior becomes undefined.' },
    difficulty: 'intermediate' as const,
    tags: ['goroutines', 'data-race'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Как работает планирование горутин в Go?', en: 'How does goroutine scheduling work in Go?' },
    options: {
      ru: ['Кооперативно — горутины переключаются в точках вызова функций (и с Go 1.14 также асинхронно)', 'Полностью вытесняющее, как потоки ОС', 'Горутины не переключаются вовсе', 'Каждая горутина имеет свой поток ОС'],
      en: ['Cooperatively — goroutines switch at function call points (and since Go 1.14 also asynchronously)', 'Fully preemptive, like OS threads', 'Goroutines do not switch at all', 'Each goroutine has its own OS thread'],
    },
    correct: 0 as const,
    explanation: { ru: 'Планировщик Go — кооперативный с асинхронным вытеснением (с Go 1.14). Переключение в safe points (вызовы функций, системные вызовы).', en: 'The Go scheduler is cooperative with asynchronous preemption (since Go 1.14). Switching at safe points (function calls, syscalls).' },
    difficulty: 'intermediate' as const,
    tags: ['goroutines', 'scheduling', 'preemption'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Какая функция возвращает текущее количество горутин?', en: 'Which function returns the current number of goroutines?' },
    options: {
      ru: ['runtime.NumGoroutine()', 'runtime.GoroutineCount()', 'runtime.GoCount()', 'sync.GoroutineNum()'],
      en: ['runtime.NumGoroutine()', 'runtime.GoroutineCount()', 'runtime.GoCount()', 'sync.GoroutineNum()'],
    },
    correct: 0 as const,
    explanation: { ru: 'runtime.NumGoroutine() возвращает число активных горутин. Полезно для отладки утечек горутин.', en: 'runtime.NumGoroutine() returns the number of active goroutines. Useful for debugging goroutine leaks.' },
    difficulty: 'basic' as const,
    tags: ['goroutines', 'runtime', 'numgoroutine'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Чем горутина отличается от корутины (coroutine)?', en: 'How does a goroutine differ from a coroutine?' },
    options: {
      ru: ['Горутины могут выполняться параллельно на разных ядрах; корутины — кооперативная многозадачность на одном потоке', 'Это одно и то же', 'Корутины быстрее горутин', 'Горутины не могут быть вложенными, а корутины могут'],
      en: ['Goroutines can run in parallel on multiple cores; coroutines are cooperative multitasking on a single thread', 'They are the same thing', 'Coroutines are faster than goroutines', 'Goroutines cannot be nested, but coroutines can'],
    },
    correct: 0 as const,
    explanation: { ru: 'Горутины мультиплексируются на потоки ОС и могут выполняться параллельно. Корутины обычно работают кооперативно в одном потоке.', en: 'Goroutines are multiplexed onto OS threads and can run in parallel. Coroutines typically run cooperatively on a single thread.' },
    difficulty: 'intermediate' as const,
    tags: ['goroutines', 'coroutine'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Для чего используется пакет errgroup?', en: 'What is the errgroup package used for?' },
    options: {
      ru: ['Для параллельного выполнения горутин с обработкой ошибок и автоматической отменой', 'Для группировки ошибок в одну', 'Для повторных попыток при ошибке', 'Для логирования ошибок горутин'],
      en: ['For running goroutines concurrently with error handling and automatic cancellation', 'For grouping errors into one', 'For retrying on error', 'For logging goroutine errors'],
    },
    correct: 0 as const,
    explanation: { ru: 'errgroup.Group запускает горутины, собирает первую ошибку и может отменять context при ошибке через WithContext().', en: 'errgroup.Group runs goroutines, collects the first error, and can cancel the context on error via WithContext().' },
    difficulty: 'intermediate' as const,
    tags: ['goroutines', 'errgroup'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Сколько памяти занимает горутина при создании?', en: 'How much memory does a goroutine consume at creation?' },
    options: {
      ru: ['Примерно 2 КБ (начальный стек)', '1 МБ', '64 КБ', '256 байт'],
      en: ['About 2 KB (initial stack)', '1 MB', '64 KB', '256 bytes'],
    },
    correct: 0 as const,
    explanation: { ru: 'Начальный стек горутины — около 2 КБ (Go 1.4+). Это позволяет создавать сотни тысяч горутин.', en: 'The initial goroutine stack is about 2 KB (Go 1.4+). This allows creating hundreds of thousands of goroutines.' },
    difficulty: 'basic' as const,
    tags: ['goroutines', 'memory'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Какая проблема может возникнуть при захвате переменной цикла в замыкании горутины?', en: 'What problem can occur when capturing a loop variable in a goroutine closure?' },
    options: {
      ru: ['Все горутины могут использовать одно и то же последнее значение переменной (до Go 1.22)', 'Компилятор выдаст ошибку', 'Каждая горутина автоматически получит копию', 'Произойдёт паника'],
      en: ['All goroutines may use the same last value of the variable (before Go 1.22)', 'The compiler will produce an error', 'Each goroutine automatically gets a copy', 'A panic occurs'],
    },
    correct: 0 as const,
    explanation: { ru: 'До Go 1.22 переменная цикла была одна для всех итераций. Горутины, захватившие её по ссылке, видели последнее значение. Решение: передать копию как аргумент.', en: 'Before Go 1.22, the loop variable was shared across iterations. Goroutines capturing it by reference saw the last value. Fix: pass a copy as an argument.' },
    difficulty: 'intermediate' as const,
    tags: ['goroutines', 'closure', 'loop-variable'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-goroutines', quizId: null,
    question: { ru: 'Какой основной механизм коммуникации между горутинами в Go?', en: 'What is the primary communication mechanism between goroutines in Go?' },
    options: {
      ru: ['Каналы (channels)', 'Разделяемая память', 'Сигналы ОС', 'Файловая система'],
      en: ['Channels', 'Shared memory', 'OS signals', 'File system'],
    },
    correct: 0 as const,
    explanation: { ru: 'Философия Go: «Не общайтесь через разделяемую память; разделяйте память через общение» — каналы предпочтительнее мьютексов.', en: 'Go philosophy: "Don\'t communicate by sharing memory; share memory by communicating" — channels are preferred over mutexes.' },
    difficulty: 'basic' as const,
    tags: ['goroutines', 'channels', 'communication'],
  },
]

// ── Concurrency: Channels (20 questions) ───────────────────────────────────
const questionsConcurrencyChannels: BilingualQuestion[] = [
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Как работает небуферизованный канал?', en: 'How does an unbuffered channel work?' },
    options: {
      ru: ['Блокирует отправителя до тех пор, пока получатель не будет готов, и наоборот', 'Хранит одно значение в буфере', 'Работает как очередь без ограничений', 'Не блокирует ни отправителя, ни получателя'],
      en: ['Blocks the sender until a receiver is ready, and vice versa', 'Stores one value in a buffer', 'Works as an unlimited queue', 'Does not block either sender or receiver'],
    },
    correct: 0 as const,
    explanation: { ru: 'Небуферизованный канал (make(chan T)) требует, чтобы отправитель и получатель были готовы одновременно — синхронная передача.', en: 'An unbuffered channel (make(chan T)) requires both sender and receiver to be ready — synchronous transfer.' },
    difficulty: 'basic' as const,
    tags: ['channels', 'unbuffered'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Когда буферизованный канал блокирует отправителя?', en: 'When does a buffered channel block the sender?' },
    options: {
      ru: ['Когда буфер полон', 'Когда буфер пуст', 'Никогда не блокирует', 'Когда нет получателей'],
      en: ['When the buffer is full', 'When the buffer is empty', 'It never blocks', 'When there are no receivers'],
    },
    correct: 0 as const,
    explanation: { ru: 'Буферизованный канал блокирует отправку, когда буфер заполнен. Получение блокирует, когда буфер пуст.', en: 'A buffered channel blocks sending when the buffer is full. Receiving blocks when the buffer is empty.' },
    difficulty: 'basic' as const,
    tags: ['channels', 'buffered'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'В чём разница между make(chan int) и make(chan int, 5)?', en: 'What is the difference between make(chan int) and make(chan int, 5)?' },
    options: {
      ru: ['Первый — небуферизованный, второй — буферизованный с ёмкостью 5', 'Первый создаёт канал размером 1, второй — размером 5', 'Оба небуферизованные', 'Первый только для чтения, второй для записи'],
      en: ['First is unbuffered, second is buffered with capacity 5', 'First creates a channel of size 1, second of size 5', 'Both are unbuffered', 'First is read-only, second is write-only'],
    },
    correct: 0 as const,
    explanation: { ru: 'make(chan int) создаёт небуферизованный канал. make(chan int, 5) создаёт буферизованный канал на 5 элементов.', en: 'make(chan int) creates an unbuffered channel. make(chan int, 5) creates a buffered channel for 5 elements.' },
    difficulty: 'basic' as const,
    tags: ['channels', 'make', 'buffered'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Что произойдёт при отправке в закрытый канал?', en: 'What happens when you send to a closed channel?' },
    options: {
      ru: ['Паника (panic)', 'Значение будет потеряно', 'Вернётся ошибка', 'Ничего не произойдёт'],
      en: ['Panic', 'The value is lost', 'An error is returned', 'Nothing happens'],
    },
    correct: 0 as const,
    explanation: { ru: 'Отправка в закрытый канал вызывает panic: send on closed channel.', en: 'Sending to a closed channel causes panic: send on closed channel.' },
    difficulty: 'intermediate' as const,
    tags: ['channels', 'close', 'panic'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Что вернёт чтение из закрытого канала?', en: 'What does reading from a closed channel return?' },
    options: {
      ru: ['Нулевое значение типа и false (второй результат)', 'Панику', 'Ошибку io.EOF', 'Блокировку навсегда'],
      en: ['The zero value of the type and false (second result)', 'A panic', 'An io.EOF error', 'A forever block'],
    },
    correct: 0 as const,
    explanation: { ru: 'Чтение из закрытого канала возвращает нулевое значение немедленно. v, ok := <-ch — ok будет false.', en: 'Reading from a closed channel returns the zero value immediately. v, ok := <-ch — ok will be false.' },
    difficulty: 'intermediate' as const,
    tags: ['channels', 'close', 'zero-value'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Кто должен закрывать канал — отправитель или получатель?', en: 'Who should close a channel — the sender or the receiver?' },
    options: {
      ru: ['Только отправитель', 'Только получатель', 'Любая сторона', 'Канал закрывается автоматически'],
      en: ['Only the sender', 'Only the receiver', 'Either side', 'The channel closes automatically'],
    },
    correct: 0 as const,
    explanation: { ru: 'Канал должен закрывать отправитель, так как отправка в закрытый канал вызывает панику.', en: 'The sender should close the channel because sending to a closed channel causes a panic.' },
    difficulty: 'intermediate' as const,
    tags: ['channels', 'close', 'sender'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Как range работает с каналом?', en: 'How does range work with a channel?' },
    options: {
      ru: ['Итерирует по значениям до закрытия канала', 'Итерирует заданное число раз', 'Всегда читает одно значение', 'Вызывает панику, если канал пуст'],
      en: ['Iterates over values until the channel is closed', 'Iterates a given number of times', 'Always reads one value', 'Panics if the channel is empty'],
    },
    correct: 0 as const,
    explanation: { ru: 'for v := range ch читает из канала, пока он не будет закрыт. После close(ch) цикл завершится.', en: 'for v := range ch reads from the channel until it is closed. After close(ch) the loop terminates.' },
    difficulty: 'basic' as const,
    tags: ['channels', 'range'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Что делает оператор select с несколькими каналами?', en: 'What does the select statement do with multiple channels?' },
    options: {
      ru: ['Ждёт, пока один из каналов станет готов, и выполняет соответствующий case', 'Выполняет все case последовательно', 'Выполняет все case параллельно', 'Выбирает case с наивысшим приоритетом'],
      en: ['Waits until one of the channels is ready and executes the corresponding case', 'Executes all cases sequentially', 'Executes all cases in parallel', 'Picks the case with the highest priority'],
    },
    correct: 0 as const,
    explanation: { ru: 'select блокируется, пока один из case не будет готов. Если готовы несколько — выбирается случайный.', en: 'select blocks until one case is ready. If multiple are ready, one is chosen at random.' },
    difficulty: 'intermediate' as const,
    tags: ['channels', 'select'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Как сделать неблокирующее чтение из канала с помощью select?', en: 'How do you make a non-blocking read from a channel using select?' },
    options: {
      ru: ['Добавить default case в select', 'Использовать буферизованный канал', 'Использовать тайм-аут 0', 'Использовать флаг nonblock'],
      en: ['Add a default case to select', 'Use a buffered channel', 'Use a timeout of 0', 'Use the nonblock flag'],
    },
    correct: 0 as const,
    explanation: { ru: 'select с default выполняет default, если ни один канал не готов — неблокирующая операция.', en: 'select with default executes default if no channel is ready — a non-blocking operation.' },
    difficulty: 'intermediate' as const,
    tags: ['channels', 'select', 'default'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Что произойдёт при отправке или чтении из nil-канала?', en: 'What happens when you send to or receive from a nil channel?' },
    options: {
      ru: ['Операция заблокируется навсегда', 'Произойдёт паника', 'Вернётся нулевое значение', 'Ошибка компиляции'],
      en: ['The operation blocks forever', 'A panic occurs', 'A zero value is returned', 'A compilation error'],
    },
    correct: 0 as const,
    explanation: { ru: 'Отправка и чтение из nil-канала блокируются навсегда. Это используется в select для «выключения» case.', en: 'Sending to and receiving from a nil channel blocks forever. This is used in select to "disable" a case.' },
    difficulty: 'intermediate' as const,
    tags: ['channels', 'nil'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Что означает chan<- int и <-chan int?', en: 'What do chan<- int and <-chan int mean?' },
    options: {
      ru: ['chan<- int — только для записи, <-chan int — только для чтения', 'chan<- int — только для чтения, <-chan int — только для записи', 'Оба означают двунаправленный канал', 'Это некорректный синтаксис'],
      en: ['chan<- int — send-only, <-chan int — receive-only', 'chan<- int — receive-only, <-chan int — send-only', 'Both mean a bidirectional channel', 'This is invalid syntax'],
    },
    correct: 0 as const,
    explanation: { ru: 'chan<- T — канал только для записи. <-chan T — канал только для чтения. Используются для ограничения операций в сигнатурах функций.', en: 'chan<- T — send-only channel. <-chan T — receive-only channel. Used to restrict operations in function signatures.' },
    difficulty: 'intermediate' as const,
    tags: ['channels', 'directional'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Как использовать буферизованный канал в качестве семафора?', en: 'How can you use a buffered channel as a semaphore?' },
    options: {
      ru: ['Создать канал с ёмкостью N; отправка занимает слот, получение освобождает', 'Использовать len(ch) для проверки', 'Закрыть канал после N операций', 'Использовать nil-канал'],
      en: ['Create a channel with capacity N; sending takes a slot, receiving releases it', 'Use len(ch) to check', 'Close the channel after N operations', 'Use a nil channel'],
    },
    correct: 0 as const,
    explanation: { ru: 'sem := make(chan struct{}, N) — отправка в канал «занимает» слот, чтение «освобождает». Когда буфер полон — блокировка.', en: 'sem := make(chan struct{}, N) — sending to the channel "takes" a slot, reading "releases" it. When the buffer is full, it blocks.' },
    difficulty: 'intermediate' as const,
    tags: ['channels', 'semaphore'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Что такое паттерн fan-out/fan-in?', en: 'What is the fan-out/fan-in pattern?' },
    options: {
      ru: ['Fan-out: несколько горутин читают из одного канала. Fan-in: результаты из нескольких каналов сливаются в один', 'Fan-out: одна горутина пишет в несколько каналов. Fan-in: чтение из одного канала', 'Это паттерн для обработки ошибок', 'Это паттерн для логирования'],
      en: ['Fan-out: multiple goroutines read from one channel. Fan-in: results from multiple channels merge into one', 'Fan-out: one goroutine writes to multiple channels. Fan-in: reading from one channel', 'It is an error handling pattern', 'It is a logging pattern'],
    },
    correct: 0 as const,
    explanation: { ru: 'Fan-out распределяет работу между горутинами. Fan-in собирает результаты из нескольких каналов в один.', en: 'Fan-out distributes work among goroutines. Fan-in collects results from multiple channels into one.' },
    difficulty: 'intermediate' as const,
    tags: ['channels', 'fan-out', 'fan-in'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Что такое pipeline-паттерн на каналах?', en: 'What is the pipeline pattern with channels?' },
    options: {
      ru: ['Цепочка стадий, где каждая стадия читает из входного канала, обрабатывает и пишет в выходной', 'Параллельное выполнение всех стадий на одном канале', 'Использование одного канала для всех операций', 'Цепочка мьютексов'],
      en: ['A chain of stages where each reads from an input channel, processes, and writes to an output channel', 'Parallel execution of all stages on one channel', 'Using a single channel for all operations', 'A chain of mutexes'],
    },
    correct: 0 as const,
    explanation: { ru: 'Pipeline — последовательность стадий (горутин), соединённых каналами. Каждая стадия трансформирует данные.', en: 'Pipeline — a sequence of stages (goroutines) connected by channels. Each stage transforms data.' },
    difficulty: 'intermediate' as const,
    tags: ['channels', 'pipeline'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Как done-канал используется для отмены?', en: 'How is a done channel used for cancellation?' },
    options: {
      ru: ['Горутина слушает close(done) через select и завершается при закрытии', 'Горутина отправляет значение в done для отмены', 'done-канал используется для передачи ошибок', 'done-канал запускает новые горутины'],
      en: ['The goroutine listens for close(done) via select and exits on close', 'The goroutine sends a value to done for cancellation', 'The done channel is used to pass errors', 'The done channel spawns new goroutines'],
    },
    correct: 0 as const,
    explanation: { ru: 'Закрытие done-канала разблокирует все select-case, слушающие <-done, — сигнал отмены для всех горутин.', en: 'Closing the done channel unblocks all select cases listening on <-done — a cancellation signal for all goroutines.' },
    difficulty: 'intermediate' as const,
    tags: ['channels', 'done', 'cancellation'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Когда лучше использовать каналы, а когда мьютексы?', en: 'When should you use channels vs mutexes?' },
    options: {
      ru: ['Каналы — для передачи данных между горутинами; мьютексы — для защиты разделяемого состояния', 'Каналы всегда лучше мьютексов', 'Мьютексы всегда быстрее каналов', 'Они взаимозаменяемы'],
      en: ['Channels — for passing data between goroutines; mutexes — for protecting shared state', 'Channels are always better than mutexes', 'Mutexes are always faster than channels', 'They are interchangeable'],
    },
    correct: 0 as const,
    explanation: { ru: 'Каналы для передачи владения данными, мьютексы для защиты доступа к общему состоянию. Выбор зависит от задачи.', en: 'Channels for transferring data ownership, mutexes for protecting access to shared state. The choice depends on the task.' },
    difficulty: 'intermediate' as const,
    tags: ['channels', 'mutex', 'comparison'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Что означает deadlock «fatal error: all goroutines are asleep»?', en: 'What does the deadlock "fatal error: all goroutines are asleep" mean?' },
    options: {
      ru: ['Все горутины заблокированы и ни одна не может продолжить выполнение', 'Слишком много горутин создано', 'Произошла утечка памяти', 'Канал переполнен'],
      en: ['All goroutines are blocked and none can proceed', 'Too many goroutines were created', 'A memory leak occurred', 'A channel overflowed'],
    },
    correct: 0 as const,
    explanation: { ru: 'Рантайм Go обнаруживает, что все горутины заблокированы (например, ждут каналы) — ни одна не может продвинуться. Это deadlock.', en: 'The Go runtime detects that all goroutines are blocked (e.g., waiting on channels) — none can progress. This is a deadlock.' },
    difficulty: 'intermediate' as const,
    tags: ['channels', 'deadlock'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Что возвращают len(ch) и cap(ch) для канала?', en: 'What do len(ch) and cap(ch) return for a channel?' },
    options: {
      ru: ['len — количество элементов в буфере, cap — ёмкость буфера', 'len — ёмкость, cap — количество элементов', 'Оба возвращают ёмкость', 'Они не применимы к каналам'],
      en: ['len — number of elements in the buffer, cap — buffer capacity', 'len — capacity, cap — number of elements', 'Both return the capacity', 'They are not applicable to channels'],
    },
    correct: 0 as const,
    explanation: { ru: 'len(ch) возвращает число элементов, находящихся в буфере канала. cap(ch) — максимальную ёмкость буфера.', en: 'len(ch) returns the number of elements currently in the channel buffer. cap(ch) returns the maximum buffer capacity.' },
    difficulty: 'basic' as const,
    tags: ['channels', 'len', 'cap'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Можно ли преобразовать двунаправленный канал в однонаправленный?', en: 'Can you convert a bidirectional channel to a unidirectional one?' },
    options: {
      ru: ['Да, двунаправленный неявно приводится к chan<- T или <-chan T', 'Нет, типы каналов несовместимы', 'Только через type assertion', 'Только через unsafe.Pointer'],
      en: ['Yes, a bidirectional channel implicitly converts to chan<- T or <-chan T', 'No, channel types are incompatible', 'Only via type assertion', 'Only via unsafe.Pointer'],
    },
    correct: 0 as const,
    explanation: { ru: 'Go позволяет неявное преобразование chan T → chan<- T или <-chan T. Обратное преобразование невозможно.', en: 'Go allows implicit conversion from chan T → chan<- T or <-chan T. The reverse conversion is not possible.' },
    difficulty: 'intermediate' as const,
    tags: ['channels', 'unidirectional', 'conversion'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-channels', quizId: null,
    question: { ru: 'Как реализовать тайм-аут с помощью select и time.After?', en: 'How do you implement a timeout using select and time.After?' },
    options: {
      ru: ['case <-time.After(duration): — если основной канал не готов за duration, выполняется тайм-аут', 'Использовать time.Sleep() перед чтением', 'Установить таймер на канал с помощью SetTimeout()', 'Использовать context.WithTimeout() вместо select'],
      en: ['case <-time.After(duration): — if the main channel is not ready within duration, the timeout case runs', 'Use time.Sleep() before reading', 'Set a timer on the channel with SetTimeout()', 'Use context.WithTimeout() instead of select'],
    },
    correct: 0 as const,
    explanation: { ru: 'select { case v := <-ch: ... case <-time.After(5*time.Second): ... } — если из ch ничего не пришло за 5 секунд, выполняется тайм-аут.', en: 'select { case v := <-ch: ... case <-time.After(5*time.Second): ... } — if nothing arrives from ch within 5 seconds, the timeout case runs.' },
    difficulty: 'intermediate' as const,
    tags: ['channels', 'select', 'timeout', 'time.After'],
  },
]

// ── Concurrency: sync Package (20 questions) ──────────────────────────────
const questionsConcurrencySync: BilingualQuestion[] = [
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'Какие методы предоставляет sync.Mutex?', en: 'What methods does sync.Mutex provide?' },
    options: {
      ru: ['Lock() и Unlock()', 'Acquire() и Release()', 'Enter() и Exit()', 'Wait() и Signal()'],
      en: ['Lock() and Unlock()', 'Acquire() and Release()', 'Enter() and Exit()', 'Wait() and Signal()'],
    },
    correct: 0 as const,
    explanation: { ru: 'sync.Mutex предоставляет Lock() для захвата и Unlock() для освобождения блокировки.', en: 'sync.Mutex provides Lock() to acquire and Unlock() to release the lock.' },
    difficulty: 'basic' as const,
    tags: ['sync', 'mutex'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'В чём разница между sync.Mutex и sync.RWMutex?', en: 'What is the difference between sync.Mutex and sync.RWMutex?' },
    options: {
      ru: ['RWMutex разрешает несколько одновременных читателей, но только одного писателя', 'RWMutex быстрее Mutex во всех случаях', 'RWMutex блокирует только запись, чтение не блокируется', 'Нет разницы, это алиасы'],
      en: ['RWMutex allows multiple concurrent readers but only one writer', 'RWMutex is faster than Mutex in all cases', 'RWMutex only blocks writes, reads are never blocked', 'No difference, they are aliases'],
    },
    correct: 0 as const,
    explanation: { ru: 'RWMutex: RLock() для чтения (несколько одновременно), Lock() для записи (эксклюзивный). Mutex — всегда эксклюзивный.', en: 'RWMutex: RLock() for reading (multiple concurrent), Lock() for writing (exclusive). Mutex is always exclusive.' },
    difficulty: 'intermediate' as const,
    tags: ['sync', 'rwmutex'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'Почему sync.Mutex нельзя копировать?', en: 'Why must sync.Mutex not be copied?' },
    options: {
      ru: ['Копия сохранит внутреннее состояние блокировки, что приведёт к некорректной синхронизации', 'Go запрещает копирование любых структур', 'Копия будет разблокирована автоматически', 'Это вызовет ошибку компиляции'],
      en: ['The copy preserves the internal lock state, leading to incorrect synchronization', 'Go prohibits copying any struct', 'The copy will be automatically unlocked', 'It will cause a compilation error'],
    },
    correct: 0 as const,
    explanation: { ru: 'При копировании Mutex копируется его состояние. Если мьютекс был заблокирован, копия тоже будет заблокирована, нарушая логику. go vet обнаруживает это.', en: 'Copying a Mutex copies its state. If the mutex was locked, the copy will also be locked, breaking logic. go vet detects this.' },
    difficulty: 'intermediate' as const,
    tags: ['sync', 'mutex', 'copy'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'Зачем использовать defer mu.Unlock()?', en: 'Why use defer mu.Unlock()?' },
    options: {
      ru: ['Гарантирует разблокировку даже при панике или раннем return', 'Это быстрее, чем обычный вызов Unlock()', 'Позволяет блокировке автоматически продлеваться', 'Это обязательный синтаксис для мьютексов'],
      en: ['Guarantees unlock even on panic or early return', 'It is faster than a regular Unlock() call', 'Allows the lock to auto-extend', 'It is mandatory syntax for mutexes'],
    },
    correct: 0 as const,
    explanation: { ru: 'defer mu.Unlock() гарантирует, что Unlock() будет вызван при выходе из функции, даже при панике или множественных return.', en: 'defer mu.Unlock() guarantees that Unlock() is called on function exit, even on panic or multiple returns.' },
    difficulty: 'basic' as const,
    tags: ['sync', 'mutex', 'defer'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'Что гарантирует sync.Once.Do()?', en: 'What does sync.Once.Do() guarantee?' },
    options: {
      ru: ['Функция выполнится ровно один раз, даже при вызове из нескольких горутин', 'Функция выполнится в каждой горутине', 'Функция выполнится не более N раз', 'Функция выполнится после завершения всех горутин'],
      en: ['The function runs exactly once, even when called from multiple goroutines', 'The function runs in each goroutine', 'The function runs at most N times', 'The function runs after all goroutines complete'],
    },
    correct: 0 as const,
    explanation: { ru: 'sync.Once.Do(f) гарантирует, что f будет вызвана ровно один раз. Все остальные вызовы Do() ждут завершения первого.', en: 'sync.Once.Do(f) guarantees f is called exactly once. All other Do() calls wait for the first to complete.' },
    difficulty: 'intermediate' as const,
    tags: ['sync', 'once'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'Когда нужно вызывать WaitGroup.Add() — до или после запуска горутины?', en: 'When should WaitGroup.Add() be called — before or after starting the goroutine?' },
    options: {
      ru: ['До запуска горутины', 'После запуска горутины', 'Внутри горутины', 'Порядок не важен'],
      en: ['Before starting the goroutine', 'After starting the goroutine', 'Inside the goroutine', 'The order does not matter'],
    },
    correct: 0 as const,
    explanation: { ru: 'Add() нужно вызывать до go f(), чтобы избежать гонки: Wait() может вернуться раньше, если Add() вызван после запуска горутины.', en: 'Add() must be called before go f() to avoid a race: Wait() may return early if Add() is called after starting the goroutine.' },
    difficulty: 'intermediate' as const,
    tags: ['sync', 'waitgroup', 'add'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'Для чего используется sync.Pool?', en: 'What is sync.Pool used for?' },
    options: {
      ru: ['Для повторного использования временных объектов и снижения нагрузки на GC', 'Для пула горутин', 'Для пула соединений к базе данных', 'Для кеширования данных между запусками'],
      en: ['For reusing temporary objects and reducing GC pressure', 'For a goroutine pool', 'For a database connection pool', 'For caching data between runs'],
    },
    correct: 0 as const,
    explanation: { ru: 'sync.Pool — пул временных объектов. Get() достаёт объект, Put() возвращает. GC может очистить пул в любой момент.', en: 'sync.Pool — a pool of temporary objects. Get() retrieves, Put() returns. The GC can clear the pool at any time.' },
    difficulty: 'intermediate' as const,
    tags: ['sync', 'pool'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'Какие атомарные операции предоставляет пакет sync/atomic?', en: 'What atomic operations does the sync/atomic package provide?' },
    options: {
      ru: ['AddInt64, LoadInt64, StoreInt64, CompareAndSwapInt64 и другие', 'Только Add и Load', 'Только Lock и Unlock', 'Атомарные операции со строками'],
      en: ['AddInt64, LoadInt64, StoreInt64, CompareAndSwapInt64 and others', 'Only Add and Load', 'Only Lock and Unlock', 'Atomic string operations'],
    },
    correct: 0 as const,
    explanation: { ru: 'sync/atomic предоставляет атомарные Add, Load, Store, Swap, CompareAndSwap для int32/int64/uint32/uint64/uintptr и atomic.Value.', en: 'sync/atomic provides atomic Add, Load, Store, Swap, CompareAndSwap for int32/int64/uint32/uint64/uintptr and atomic.Value.' },
    difficulty: 'intermediate' as const,
    tags: ['sync', 'atomic'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'Для чего используется atomic.Value?', en: 'What is atomic.Value used for?' },
    options: {
      ru: ['Для атомарного чтения/записи значения произвольного типа (interface{})', 'Для атомарных операций только с числами', 'Для хранения нескольких значений атомарно', 'Для замены мьютексов во всех случаях'],
      en: ['For atomic read/write of a value of any type (interface{})', 'For atomic operations with numbers only', 'For storing multiple values atomically', 'For replacing mutexes in all cases'],
    },
    correct: 0 as const,
    explanation: { ru: 'atomic.Value позволяет атомарно Load() и Store() значение типа interface{}. Полезно для конфигов, обновляемых в рантайме.', en: 'atomic.Value allows atomic Load() and Store() of an interface{} value. Useful for configs updated at runtime.' },
    difficulty: 'intermediate' as const,
    tags: ['sync', 'atomic', 'value'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'Когда sync.Map предпочтительнее обычной map + sync.Mutex?', en: 'When is sync.Map preferable to a regular map + sync.Mutex?' },
    options: {
      ru: ['Когда ключи стабильны (мало записей, много чтений) или горутины работают с непересекающимися ключами', 'Всегда — sync.Map быстрее', 'Когда нужна сортировка ключей', 'Когда карта очень маленькая'],
      en: ['When keys are stable (few writes, many reads) or goroutines access disjoint keys', 'Always — sync.Map is faster', 'When keys need sorting', 'When the map is very small'],
    },
    correct: 0 as const,
    explanation: { ru: 'sync.Map оптимизирован для двух случаев: 1) ключи записываются один раз и читаются часто; 2) горутины работают с разными ключами.', en: 'sync.Map is optimized for two cases: 1) keys written once and read often; 2) goroutines work with different keys.' },
    difficulty: 'intermediate' as const,
    tags: ['sync', 'sync-map'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'Для чего используется sync.Cond?', en: 'What is sync.Cond used for?' },
    options: {
      ru: ['Для ожидания/оповещения горутин о выполнении условия', 'Для условной компиляции', 'Для проверки условий в тестах', 'Для создания условных каналов'],
      en: ['For waiting/notifying goroutines about a condition being met', 'For conditional compilation', 'For checking conditions in tests', 'For creating conditional channels'],
    },
    correct: 0 as const,
    explanation: { ru: 'sync.Cond позволяет горутинам ждать (Wait) и получать уведомления (Signal/Broadcast) о выполнении условия.', en: 'sync.Cond allows goroutines to wait (Wait) and receive notifications (Signal/Broadcast) about a condition being met.' },
    difficulty: 'intermediate' as const,
    tags: ['sync', 'cond'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'В чём разница между race condition и data race?', en: 'What is the difference between a race condition and a data race?' },
    options: {
      ru: ['Data race — одновременный доступ к памяти без синхронизации; race condition — логическая ошибка зависящая от порядка выполнения', 'Это одно и то же', 'Race condition всегда вызывает панику', 'Data race — это подтип race condition, обнаруживаемый компилятором'],
      en: ['Data race — unsynchronized concurrent memory access; race condition — a logic bug dependent on execution order', 'They are the same thing', 'Race condition always causes a panic', 'Data race is a subtype of race condition detected by the compiler'],
    },
    correct: 0 as const,
    explanation: { ru: 'Data race — технический термин: ≥2 горутин обращаются к памяти, ≥1 пишет. Race condition — логическая ошибка из-за порядка выполнения.', en: 'Data race — a technical term: ≥2 goroutines access memory, ≥1 writes. Race condition — a logic bug due to execution order.' },
    difficulty: 'intermediate' as const,
    tags: ['sync', 'race-condition', 'data-race'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'Почему в Go рекомендуется использовать sync.Once вместо double-checked locking?', en: 'Why does Go recommend sync.Once over double-checked locking?' },
    options: {
      ru: ['sync.Once проще, безопаснее и гарантирует корректность; double-checked locking подвержен ошибкам', 'Double-checked locking запрещён компилятором Go', 'sync.Once быстрее', 'Double-checked locking невозможен без unsafe'],
      en: ['sync.Once is simpler, safer, and guarantees correctness; double-checked locking is error-prone', 'Double-checked locking is forbidden by the Go compiler', 'sync.Once is faster', 'Double-checked locking is impossible without unsafe'],
    },
    correct: 0 as const,
    explanation: { ru: 'sync.Once использует атомарные операции и мьютекс внутри, гарантируя однократное выполнение. Double-checked locking легко сломать.', en: 'sync.Once uses atomic operations and a mutex internally, guaranteeing single execution. Double-checked locking is easy to break.' },
    difficulty: 'intermediate' as const,
    tags: ['sync', 'once', 'double-checked-locking'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'Какие методы предоставляет sync.Map?', en: 'What methods does sync.Map provide?' },
    options: {
      ru: ['Load, Store, Delete, Range, LoadOrStore, LoadAndDelete', 'Get, Set, Remove', 'Read, Write, Clear', 'Lock, Unlock, Get, Set'],
      en: ['Load, Store, Delete, Range, LoadOrStore, LoadAndDelete', 'Get, Set, Remove', 'Read, Write, Clear', 'Lock, Unlock, Get, Set'],
    },
    correct: 0 as const,
    explanation: { ru: 'sync.Map: Load(key), Store(key, val), Delete(key), Range(func), LoadOrStore(), LoadAndDelete().', en: 'sync.Map: Load(key), Store(key, val), Delete(key), Range(func), LoadOrStore(), LoadAndDelete().' },
    difficulty: 'intermediate' as const,
    tags: ['sync', 'sync-map', 'methods'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'Что такое mutex starvation?', en: 'What is mutex starvation?' },
    options: {
      ru: ['Ситуация, когда одна горутина не может захватить мьютекс из-за постоянного захвата другими', 'Когда мьютекс потребляет слишком много памяти', 'Когда мьютекс никогда не разблокируется', 'Когда мьютекс используется без defer'],
      en: ['A situation where one goroutine cannot acquire the mutex because others keep acquiring it', 'When a mutex consumes too much memory', 'When a mutex is never unlocked', 'When a mutex is used without defer'],
    },
    correct: 0 as const,
    explanation: { ru: 'Starvation — горутина ждёт мьютекс, но другие горутины непрерывно захватывают его. В Go 1.9+ мьютексы переключаются в «голодный» режим.', en: 'Starvation — a goroutine waits for a mutex, but others continuously acquire it. In Go 1.9+, mutexes switch to "starvation" mode.' },
    difficulty: 'intermediate' as const,
    tags: ['sync', 'mutex', 'starvation'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'Что произойдёт, если счётчик WaitGroup станет отрицательным?', en: 'What happens if the WaitGroup counter goes negative?' },
    options: {
      ru: ['Паника: sync: negative WaitGroup counter', 'Счётчик обнулится', 'Wait() вернётся немедленно', 'Горутина завершится с ошибкой'],
      en: ['Panic: sync: negative WaitGroup counter', 'The counter resets to zero', 'Wait() returns immediately', 'The goroutine terminates with an error'],
    },
    correct: 0 as const,
    explanation: { ru: 'Вызов Done() (или Add(-1)) при нулевом счётчике приводит к панике. Нужно следить за балансом Add/Done.', en: 'Calling Done() (or Add(-1)) when the counter is zero causes a panic. You must balance Add/Done calls.' },
    difficulty: 'intermediate' as const,
    tags: ['sync', 'waitgroup', 'negative'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'Что делает atomic.CompareAndSwapInt64?', en: 'What does atomic.CompareAndSwapInt64 do?' },
    options: {
      ru: ['Атомарно сравнивает значение с ожидаемым и, если совпадает, заменяет на новое', 'Меняет два значения местами', 'Сравнивает два int64 и возвращает bool', 'Блокирует значение для записи'],
      en: ['Atomically compares the value with expected and, if equal, replaces with new', 'Swaps two values', 'Compares two int64 and returns bool', 'Locks the value for writing'],
    },
    correct: 0 as const,
    explanation: { ru: 'CAS (Compare-And-Swap) — атомарная операция: если *addr == old, записать new. Возвращает true, если замена произошла.', en: 'CAS (Compare-And-Swap) — an atomic operation: if *addr == old, write new. Returns true if the swap occurred.' },
    difficulty: 'intermediate' as const,
    tags: ['sync', 'atomic', 'cas'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'Гарантирует ли sync.Pool сохранение объектов между циклами GC?', en: 'Does sync.Pool guarantee object persistence between GC cycles?' },
    options: {
      ru: ['Нет, GC может очистить Pool в любой момент', 'Да, объекты сохраняются навсегда', 'Да, но только после вызова runtime.KeepAlive()', 'Только если Pool создан с флагом persistent'],
      en: ['No, the GC can clear the Pool at any time', 'Yes, objects are kept forever', 'Yes, but only after calling runtime.KeepAlive()', 'Only if Pool is created with the persistent flag'],
    },
    correct: 0 as const,
    explanation: { ru: 'sync.Pool не гарантирует сохранение объектов. GC может очистить пул. Pool — для временных объектов, не для кеша.', en: 'sync.Pool does not guarantee object persistence. The GC can clear the pool. Pool is for temporary objects, not caching.' },
    difficulty: 'intermediate' as const,
    tags: ['sync', 'pool', 'gc'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'Что позволяет RWMutex.RLock()?', en: 'What does RWMutex.RLock() allow?' },
    options: {
      ru: ['Захватить блокировку на чтение — несколько горутин могут держать RLock одновременно', 'Захватить эксклюзивную блокировку', 'Рекурсивно захватить блокировку', 'Захватить блокировку с тайм-аутом'],
      en: ['Acquire a read lock — multiple goroutines can hold RLock simultaneously', 'Acquire an exclusive lock', 'Recursively acquire the lock', 'Acquire a lock with a timeout'],
    },
    correct: 0 as const,
    explanation: { ru: 'RLock() захватывает блокировку на чтение. Несколько горутин могут одновременно держать RLock. Lock() (на запись) ждёт освобождения всех RLock.', en: 'RLock() acquires a read lock. Multiple goroutines can hold RLock concurrently. Lock() (for writing) waits for all RLocks to be released.' },
    difficulty: 'intermediate' as const,
    tags: ['sync', 'rwmutex', 'rlock'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-sync', quizId: null,
    question: { ru: 'Почему нельзя смешивать atomic и mutex для одной переменной?', en: 'Why should you not mix atomic and mutex for the same variable?' },
    options: {
      ru: ['Атомарные операции и мьютексы не синхронизированы друг с другом — возникнет data race', 'Компилятор запрещает это', 'Atomic и mutex используют одну и ту же блокировку', 'Это замедляет программу, но безопасно'],
      en: ['Atomic operations and mutexes are not synchronized with each other — a data race occurs', 'The compiler forbids it', 'Atomic and mutex use the same lock', 'It slows the program but is safe'],
    },
    correct: 0 as const,
    explanation: { ru: 'Если одна горутина защищает переменную мьютексом, а другая — атомарной операцией, синхронизация нарушена. Нужен единый механизм.', en: 'If one goroutine protects a variable with a mutex and another with an atomic operation, synchronization is broken. Use a single mechanism.' },
    difficulty: 'intermediate' as const,
    tags: ['sync', 'atomic', 'mutex', 'mixing'],
  },
]

// ── Concurrency: Context (20 questions) ────────────────────────────────────
const questionsConcurrencyContext: BilingualQuestion[] = [
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Что возвращает context.Background()?', en: 'What does context.Background() return?' },
    options: {
      ru: ['Пустой корневой контекст, который никогда не отменяется', 'Контекст с тайм-аутом по умолчанию', 'Контекст, привязанный к main-горутине', 'nil'],
      en: ['An empty root context that is never cancelled', 'A context with a default timeout', 'A context tied to the main goroutine', 'nil'],
    },
    correct: 0 as const,
    explanation: { ru: 'context.Background() — корневой контекст. Используется как родительский в main(), init() или тестах.', en: 'context.Background() — the root context. Used as the parent in main(), init(), or tests.' },
    difficulty: 'basic' as const,
    tags: ['context', 'background'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Когда используется context.TODO()?', en: 'When is context.TODO() used?' },
    options: {
      ru: ['Когда неясно, какой контекст использовать, или он ещё не доступен', 'Для создания контекста с тайм-аутом', 'Для отмены всех горутин', 'Вместо context.Background() в production'],
      en: ['When it is unclear which context to use, or one is not yet available', 'To create a context with a timeout', 'To cancel all goroutines', 'Instead of context.Background() in production'],
    },
    correct: 0 as const,
    explanation: { ru: 'context.TODO() — заглушка, когда непонятно, какой контекст передать. Семантически эквивалентен Background(), но сигнализирует «нужно доработать».', en: 'context.TODO() — a placeholder when it is unclear which context to pass. Semantically equivalent to Background(), but signals "needs work".' },
    difficulty: 'basic' as const,
    tags: ['context', 'todo'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Что делает context.WithCancel()?', en: 'What does context.WithCancel() do?' },
    options: {
      ru: ['Создаёт дочерний контекст и функцию cancel для ручной отмены', 'Автоматически отменяет контекст через заданное время', 'Отменяет родительский контекст', 'Создаёт контекст, который нельзя отменить'],
      en: ['Creates a child context and a cancel function for manual cancellation', 'Automatically cancels the context after a duration', 'Cancels the parent context', 'Creates a context that cannot be cancelled'],
    },
    correct: 0 as const,
    explanation: { ru: 'ctx, cancel := context.WithCancel(parent) — cancel() отменяет ctx и все его дочерние контексты.', en: 'ctx, cancel := context.WithCancel(parent) — cancel() cancels ctx and all its child contexts.' },
    difficulty: 'intermediate' as const,
    tags: ['context', 'withcancel'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Чем context.WithTimeout отличается от context.WithDeadline?', en: 'How does context.WithTimeout differ from context.WithDeadline?' },
    options: {
      ru: ['WithTimeout принимает duration (относительное время), WithDeadline — абсолютное время', 'WithTimeout быстрее', 'WithDeadline нельзя отменить вручную', 'Нет разницы'],
      en: ['WithTimeout takes a duration (relative time), WithDeadline takes an absolute time', 'WithTimeout is faster', 'WithDeadline cannot be cancelled manually', 'No difference'],
    },
    correct: 0 as const,
    explanation: { ru: 'WithTimeout(parent, 5*time.Second) эквивалентен WithDeadline(parent, time.Now().Add(5*time.Second)).', en: 'WithTimeout(parent, 5*time.Second) is equivalent to WithDeadline(parent, time.Now().Add(5*time.Second)).' },
    difficulty: 'intermediate' as const,
    tags: ['context', 'withtimeout', 'withdeadline'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Что делает context.WithDeadline()?', en: 'What does context.WithDeadline() do?' },
    options: {
      ru: ['Создаёт контекст, который автоматически отменяется в указанный момент времени', 'Создаёт контекст с бесконечным сроком жизни', 'Устанавливает дедлайн на мьютекс', 'Создаёт контекст, отменяемый только вручную'],
      en: ['Creates a context that automatically cancels at a given point in time', 'Creates a context with infinite lifetime', 'Sets a deadline on a mutex', 'Creates a context that can only be cancelled manually'],
    },
    correct: 0 as const,
    explanation: { ru: 'context.WithDeadline(parent, deadline) создаёт контекст, который отменится не позднее deadline.', en: 'context.WithDeadline(parent, deadline) creates a context that will be cancelled no later than deadline.' },
    difficulty: 'intermediate' as const,
    tags: ['context', 'withdeadline'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Что возвращает ctx.Done()?', en: 'What does ctx.Done() return?' },
    options: {
      ru: ['Канал, который закрывается при отмене контекста', 'Булево значение', 'Ошибку', 'Функцию отмены'],
      en: ['A channel that is closed when the context is cancelled', 'A boolean', 'An error', 'A cancel function'],
    },
    correct: 0 as const,
    explanation: { ru: 'ctx.Done() возвращает <-chan struct{}, который закрывается при отмене. Используется в select для реакции на отмену.', en: 'ctx.Done() returns a <-chan struct{} that is closed on cancellation. Used in select to react to cancellation.' },
    difficulty: 'intermediate' as const,
    tags: ['context', 'done'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Какие ошибки может вернуть ctx.Err()?', en: 'What errors can ctx.Err() return?' },
    options: {
      ru: ['context.Canceled или context.DeadlineExceeded', 'io.EOF или io.ErrUnexpectedEOF', 'Любую пользовательскую ошибку', 'nil или panic'],
      en: ['context.Canceled or context.DeadlineExceeded', 'io.EOF or io.ErrUnexpectedEOF', 'Any custom error', 'nil or panic'],
    },
    correct: 0 as const,
    explanation: { ru: 'ctx.Err() возвращает nil, если контекст не отменён, context.Canceled при отмене, context.DeadlineExceeded при истечении дедлайна.', en: 'ctx.Err() returns nil if not cancelled, context.Canceled on cancel, context.DeadlineExceeded when the deadline expires.' },
    difficulty: 'intermediate' as const,
    tags: ['context', 'err'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Для чего используется context.WithValue()?', en: 'What is context.WithValue() used for?' },
    options: {
      ru: ['Для передачи request-scoped данных (trace ID, auth token) через цепочку вызовов', 'Для хранения конфигурации приложения', 'Для передачи больших объёмов данных', 'Для замены глобальных переменных'],
      en: ['For passing request-scoped data (trace ID, auth token) through the call chain', 'For storing application config', 'For passing large amounts of data', 'For replacing global variables'],
    },
    correct: 0 as const,
    explanation: { ru: 'WithValue передаёт метаданные запроса (не бизнес-логику!) через контекст. Ключ должен быть неэкспортируемого типа.', en: 'WithValue passes request metadata (not business logic!) through context. The key should be an unexported type.' },
    difficulty: 'intermediate' as const,
    tags: ['context', 'withvalue'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Какой параметр функции должен быть context по соглашению Go?', en: 'Which function parameter should context be by Go convention?' },
    options: {
      ru: ['Первый параметр: func DoSomething(ctx context.Context, ...)', 'Последний параметр', 'Передаётся через struct', 'Через глобальную переменную'],
      en: ['The first parameter: func DoSomething(ctx context.Context, ...)', 'The last parameter', 'Passed via a struct', 'Via a global variable'],
    },
    correct: 0 as const,
    explanation: { ru: 'По соглашению Go context.Context — всегда первый параметр функции. Имя параметра — ctx.', en: 'By Go convention, context.Context is always the first function parameter. The parameter name is ctx.' },
    difficulty: 'basic' as const,
    tags: ['context', 'convention'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Почему не рекомендуется хранить контекст в структуре?', en: 'Why is it not recommended to store context in a struct?' },
    options: {
      ru: ['Контекст привязан к конкретному запросу/операции; хранение в структуре нарушает его жизненный цикл', 'Это вызывает утечку памяти', 'Компилятор Go запрещает это', 'Контекст нельзя сериализовать'],
      en: ['Context is tied to a specific request/operation; storing in a struct breaks its lifecycle', 'It causes a memory leak', 'The Go compiler forbids it', 'Context cannot be serialized'],
    },
    correct: 0 as const,
    explanation: { ru: 'Контекст — request-scoped: создаётся для запроса и передаётся по цепочке вызовов. Хранение в struct привязывает его к времени жизни объекта.', en: 'Context is request-scoped: created per request and passed through the call chain. Storing in a struct binds it to the object lifetime.' },
    difficulty: 'intermediate' as const,
    tags: ['context', 'struct', 'anti-pattern'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Как контекст распространяется по цепочке вызовов?', en: 'How does context propagate through a call chain?' },
    options: {
      ru: ['Передаётся явно первым аргументом каждой функции', 'Автоматически через goroutine-local storage', 'Через глобальную переменную', 'Через переменные окружения'],
      en: ['Passed explicitly as the first argument of each function', 'Automatically via goroutine-local storage', 'Via a global variable', 'Via environment variables'],
    },
    correct: 0 as const,
    explanation: { ru: 'В Go нет implicit context — контекст передаётся явно. Это сделано сознательно для прозрачности потока данных.', en: 'Go has no implicit context — context is passed explicitly. This is intentional for data flow transparency.' },
    difficulty: 'basic' as const,
    tags: ['context', 'propagation'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Как использовать select для реакции на отмену контекста?', en: 'How do you use select to react to context cancellation?' },
    options: {
      ru: ['case <-ctx.Done(): — выполняется, когда контекст отменён', 'case ctx.Cancel(): — вызывает отмену', 'case err := ctx.Err(): — проверяет ошибку', 'select не работает с контекстами'],
      en: ['case <-ctx.Done(): — executes when the context is cancelled', 'case ctx.Cancel(): — triggers cancellation', 'case err := ctx.Err(): — checks the error', 'select does not work with contexts'],
    },
    correct: 0 as const,
    explanation: { ru: 'select { case <-ctx.Done(): return ctx.Err() case result := <-ch: ... } — стандартный паттерн реакции на отмену.', en: 'select { case <-ctx.Done(): return ctx.Err() case result := <-ch: ... } — standard cancellation reaction pattern.' },
    difficulty: 'intermediate' as const,
    tags: ['context', 'select', 'done'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Что происходит с дочерним контекстом при отмене родительского?', en: 'What happens to a child context when the parent is cancelled?' },
    options: {
      ru: ['Дочерний контекст тоже отменяется автоматически', 'Дочерний контекст продолжает работать', 'Дочерний контекст получает ошибку, но не отменяется', 'Зависит от типа дочернего контекста'],
      en: ['The child context is also cancelled automatically', 'The child context continues running', 'The child context gets an error but is not cancelled', 'It depends on the child context type'],
    },
    correct: 0 as const,
    explanation: { ru: 'Отмена родительского контекста каскадно отменяет все дочерние. Это основа иерархии контекстов в Go.', en: 'Cancelling the parent context cascades to all children. This is the basis of the context hierarchy in Go.' },
    difficulty: 'intermediate' as const,
    tags: ['context', 'parent', 'child', 'cancellation'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Что делает context.AfterFunc() (Go 1.21+)?', en: 'What does context.AfterFunc() do (Go 1.21+)?' },
    options: {
      ru: ['Регистрирует функцию, которая вызовется в отдельной горутине при отмене контекста', 'Вызывает функцию через заданное время', 'Создаёт контекст с callback на отмену', 'Заменяет defer для контекстов'],
      en: ['Registers a function to be called in a separate goroutine when the context is cancelled', 'Calls a function after a given time', 'Creates a context with a cancel callback', 'Replaces defer for contexts'],
    },
    correct: 0 as const,
    explanation: { ru: 'context.AfterFunc(ctx, f) регистрирует f, которая будет вызвана в новой горутине после отмены ctx. Возвращает stop-функцию.', en: 'context.AfterFunc(ctx, f) registers f to be called in a new goroutine after ctx is cancelled. Returns a stop function.' },
    difficulty: 'intermediate' as const,
    tags: ['context', 'afterfunc', 'go121'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Как получить контекст из HTTP-запроса?', en: 'How do you get the context from an HTTP request?' },
    options: {
      ru: ['r.Context() — возвращает контекст, привязанный к запросу', 'http.GetContext(r)', 'context.FromRequest(r)', 'r.Ctx'],
      en: ['r.Context() — returns the context tied to the request', 'http.GetContext(r)', 'context.FromRequest(r)', 'r.Ctx'],
    },
    correct: 0 as const,
    explanation: { ru: 'http.Request.Context() возвращает контекст запроса. Он отменяется, когда клиент закрывает соединение или handler возвращается.', en: 'http.Request.Context() returns the request context. It is cancelled when the client closes the connection or the handler returns.' },
    difficulty: 'basic' as const,
    tags: ['context', 'http', 'request'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Что делает context.WithoutCancel() (Go 1.21+)?', en: 'What does context.WithoutCancel() do (Go 1.21+)?' },
    options: {
      ru: ['Создаёт дочерний контекст, который не отменяется при отмене родительского', 'Удаляет функцию cancel из контекста', 'Делает контекст неизменяемым', 'Отключает тайм-аут контекста'],
      en: ['Creates a child context that is not cancelled when the parent is cancelled', 'Removes the cancel function from the context', 'Makes the context immutable', 'Disables the context timeout'],
    },
    correct: 0 as const,
    explanation: { ru: 'context.WithoutCancel(parent) создаёт контекст, наследующий значения, но не отмену. Полезно для фоновых задач.', en: 'context.WithoutCancel(parent) creates a context inheriting values but not cancellation. Useful for background tasks.' },
    difficulty: 'intermediate' as const,
    tags: ['context', 'withoutcancel', 'go121'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Почему ключи context.WithValue должны быть неэкспортируемого типа?', en: 'Why should context.WithValue keys be of an unexported type?' },
    options: {
      ru: ['Чтобы избежать коллизий ключей между разными пакетами', 'Так требует компилятор Go', 'Для повышения производительности', 'Чтобы ключи были невидимы в логах'],
      en: ['To avoid key collisions between different packages', 'The Go compiler requires it', 'For better performance', 'To make keys invisible in logs'],
    },
    correct: 0 as const,
    explanation: { ru: 'type ctxKey struct{} — неэкспортируемый тип предотвращает случайное совпадение ключей из разных пакетов.', en: 'type ctxKey struct{} — an unexported type prevents accidental key collisions from different packages.' },
    difficulty: 'intermediate' as const,
    tags: ['context', 'withvalue', 'key-type'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'В чём разница между timeout и deadline в контексте?', en: 'What is the difference between timeout and deadline in context?' },
    options: {
      ru: ['Timeout — относительная длительность (5 секунд), deadline — абсолютное время (14:30:00)', 'Timeout отменяет контекст, deadline — нет', 'Deadline быстрее timeout', 'Нет разницы'],
      en: ['Timeout is a relative duration (5 seconds), deadline is an absolute time (14:30:00)', 'Timeout cancels the context, deadline does not', 'Deadline is faster than timeout', 'No difference'],
    },
    correct: 0 as const,
    explanation: { ru: 'WithTimeout(ctx, 5s) = WithDeadline(ctx, now+5s). Timeout удобнее для «через N секунд», deadline — для «не позднее T».', en: 'WithTimeout(ctx, 5s) = WithDeadline(ctx, now+5s). Timeout is convenient for "in N seconds", deadline for "no later than T".' },
    difficulty: 'basic' as const,
    tags: ['context', 'timeout', 'deadline'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Как контекст используется в запросах к базе данных?', en: 'How is context used in database queries?' },
    options: {
      ru: ['Передаётся в методы QueryContext/ExecContext для отмены запроса при тайм-ауте', 'Контекст хранит строку подключения', 'Контекст управляет транзакциями', 'Контекст кеширует результаты запросов'],
      en: ['Passed to QueryContext/ExecContext methods to cancel the query on timeout', 'Context stores the connection string', 'Context manages transactions', 'Context caches query results'],
    },
    correct: 0 as const,
    explanation: { ru: 'db.QueryContext(ctx, sql) — если контекст отменён, запрос к БД прерывается. Это предотвращает зависание при проблемах с БД.', en: 'db.QueryContext(ctx, sql) — if the context is cancelled, the DB query is aborted. This prevents hanging on DB issues.' },
    difficulty: 'intermediate' as const,
    tags: ['context', 'database', 'querycontext'],
  },
  {
    type: 'mcq' as const, blockId: 'concurrency-context', quizId: null,
    question: { ru: 'Как errgroup использует контекст?', en: 'How does errgroup use context?' },
    options: {
      ru: ['errgroup.WithContext создаёт группу, которая автоматически отменяет контекст при первой ошибке', 'errgroup игнорирует контекст', 'errgroup передаёт ошибки через контекст', 'errgroup создаёт отдельный контекст для каждой горутины'],
      en: ['errgroup.WithContext creates a group that auto-cancels the context on the first error', 'errgroup ignores context', 'errgroup passes errors through context', 'errgroup creates a separate context for each goroutine'],
    },
    correct: 0 as const,
    explanation: { ru: 'g, ctx := errgroup.WithContext(ctx) — при первой ошибке в g.Go() контекст отменяется, сигнализируя остальным горутинам остановиться.', en: 'g, ctx := errgroup.WithContext(ctx) — on the first error in g.Go(), the context is cancelled, signaling other goroutines to stop.' },
    difficulty: 'intermediate' as const,
    tags: ['context', 'errgroup'],
  },
]

// ── SQL: Queries (20 questions) ──────────────────────────────────────────────
const questionsSqlQueries: BilingualQuestion[] = [
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Какой тип JOIN возвращает только строки, имеющие совпадения в обеих таблицах?', en: 'Which type of JOIN returns only rows that have matches in both tables?' },
    options: {
      ru: ['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL OUTER JOIN'],
      en: ['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL OUTER JOIN'],
    },
    correct: 0 as const,
    explanation: { ru: 'INNER JOIN возвращает только строки, для которых есть совпадение в обеих таблицах по условию ON.', en: 'INNER JOIN returns only rows where there is a match in both tables based on the ON condition.' },
    difficulty: 'basic' as const,
    tags: ['sql', 'join', 'inner-join'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Что возвращает LEFT JOIN, если для строки из левой таблицы нет совпадения в правой?', en: 'What does LEFT JOIN return when there is no matching row in the right table?' },
    options: {
      ru: ['Строку из левой таблицы с NULL для всех столбцов правой', 'Ничего — строка пропускается', 'Строку с пустыми строками для правой таблицы', 'Ошибку выполнения'],
      en: ['The left table row with NULL for all right table columns', 'Nothing — the row is skipped', 'A row with empty strings for the right table', 'A runtime error'],
    },
    correct: 0 as const,
    explanation: { ru: 'LEFT JOIN сохраняет все строки из левой таблицы. Если совпадения нет, столбцы правой таблицы заполняются NULL.', en: 'LEFT JOIN preserves all rows from the left table. If there is no match, right table columns are filled with NULL.' },
    difficulty: 'basic' as const,
    tags: ['sql', 'join', 'left-join'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Чем CROSS JOIN отличается от других типов JOIN?', en: 'How does CROSS JOIN differ from other types of JOIN?' },
    options: {
      ru: ['Возвращает декартово произведение — каждую строку первой таблицы со каждой строкой второй', 'Требует обязательное условие ON', 'Работает только с двумя таблицами одинаковой структуры', 'Объединяет таблицы по имени столбца'],
      en: ['Returns a Cartesian product — every row of the first table with every row of the second', 'Requires a mandatory ON condition', 'Works only with two tables of identical structure', 'Joins tables by column name'],
    },
    correct: 0 as const,
    explanation: { ru: 'CROSS JOIN формирует декартово произведение: если в первой таблице N строк, а во второй M, результат содержит N×M строк.', en: 'CROSS JOIN produces a Cartesian product: if the first table has N rows and the second has M, the result contains N×M rows.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['sql', 'join', 'cross-join'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Что такое self-join?', en: 'What is a self-join?' },
    options: {
      ru: ['JOIN таблицы с самой собой с использованием алиасов', 'Специальный синтаксис SQL для рекурсивных запросов', 'JOIN, который автоматически находит связанные столбцы', 'Объединение таблицы с её копией в другой схеме'],
      en: ['A JOIN of a table with itself using aliases', 'A special SQL syntax for recursive queries', 'A JOIN that automatically finds related columns', 'Joining a table with its copy in another schema'],
    },
    correct: 0 as const,
    explanation: { ru: 'Self-join — это соединение таблицы с самой собой. Для этого используются алиасы, чтобы различать две «копии» таблицы.', en: 'A self-join joins a table with itself. Aliases are used to distinguish the two "copies" of the table.' },
    difficulty: 'intermediate' as const,
    tags: ['sql', 'join', 'self-join'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Какая агрегатная функция считает количество строк, включая NULL?', en: 'Which aggregate function counts the number of rows, including NULL?' },
    options: {
      ru: ['COUNT(*)', 'COUNT(column)', 'SUM(1)', 'COUNT(DISTINCT column)'],
      en: ['COUNT(*)', 'COUNT(column)', 'SUM(1)', 'COUNT(DISTINCT column)'],
    },
    correct: 0 as const,
    explanation: { ru: 'COUNT(*) считает все строки, включая строки с NULL. COUNT(column) пропускает NULL в указанном столбце.', en: 'COUNT(*) counts all rows, including those with NULL. COUNT(column) skips NULL values in the specified column.' },
    difficulty: 'basic' as const,
    tags: ['sql', 'aggregate', 'count'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Чем HAVING отличается от WHERE?', en: 'How does HAVING differ from WHERE?' },
    options: {
      ru: ['HAVING фильтрует группы после GROUP BY, WHERE — строки до группировки', 'HAVING и WHERE взаимозаменяемы', 'HAVING работает быстрее WHERE', 'HAVING не может использовать агрегатные функции'],
      en: ['HAVING filters groups after GROUP BY, WHERE filters rows before grouping', 'HAVING and WHERE are interchangeable', 'HAVING is faster than WHERE', 'HAVING cannot use aggregate functions'],
    },
    correct: 0 as const,
    explanation: { ru: 'WHERE фильтрует строки до группировки. HAVING фильтрует уже сгруппированные результаты и может содержать агрегатные функции.', en: 'WHERE filters rows before grouping. HAVING filters grouped results and can contain aggregate functions.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['sql', 'group-by', 'having'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Что делает ключевое слово DISTINCT в SELECT?', en: 'What does the DISTINCT keyword do in SELECT?' },
    options: {
      ru: ['Удаляет дубликаты из результата запроса', 'Сортирует результат по возрастанию', 'Ограничивает количество строк', 'Выбирает только первую строку каждой группы'],
      en: ['Removes duplicates from the query result', 'Sorts the result in ascending order', 'Limits the number of rows', 'Selects only the first row of each group'],
    },
    correct: 0 as const,
    explanation: { ru: 'DISTINCT убирает повторяющиеся строки из результата SELECT. Сравнение происходит по всем выбранным столбцам.', en: 'DISTINCT removes duplicate rows from the SELECT result. Comparison is done across all selected columns.' },
    difficulty: 'basic' as const,
    tags: ['sql', 'distinct', 'select'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Какой порядок выполнения операторов SQL (логический)?', en: 'What is the logical order of SQL clause execution?' },
    options: {
      ru: ['FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT', 'SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY', 'FROM → SELECT → WHERE → GROUP BY → ORDER BY → LIMIT', 'SELECT → WHERE → FROM → GROUP BY → HAVING → LIMIT'],
      en: ['FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT', 'SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY', 'FROM → SELECT → WHERE → GROUP BY → ORDER BY → LIMIT', 'SELECT → WHERE → FROM → GROUP BY → HAVING → LIMIT'],
    },
    correct: 0 as const,
    explanation: { ru: 'Логический порядок: FROM (источник данных) → WHERE (фильтрация) → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT.', en: 'Logical order: FROM (data source) → WHERE (filtering) → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT.' },
    difficulty: 'intermediate' as const,
    tags: ['sql', 'execution-order', 'select'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Чем подзапрос с IN отличается от EXISTS?', en: 'How does a subquery with IN differ from EXISTS?' },
    options: {
      ru: ['IN сравнивает значение со списком, EXISTS проверяет наличие хотя бы одной строки', 'IN быстрее EXISTS во всех случаях', 'EXISTS возвращает список значений', 'Они полностью идентичны'],
      en: ['IN compares a value against a list, EXISTS checks if at least one row exists', 'IN is faster than EXISTS in all cases', 'EXISTS returns a list of values', 'They are completely identical'],
    },
    correct: 0 as const,
    explanation: { ru: 'IN подставляет значение из внешнего запроса в список. EXISTS возвращает TRUE, если подзапрос возвращает хотя бы одну строку — часто эффективнее при коррелированных подзапросах.', en: 'IN substitutes a value from the outer query into a list. EXISTS returns TRUE if the subquery returns at least one row — often more efficient with correlated subqueries.' },
    difficulty: 'intermediate' as const,
    tags: ['sql', 'subquery', 'in', 'exists'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Что такое коррелированный подзапрос?', en: 'What is a correlated subquery?' },
    options: {
      ru: ['Подзапрос, который ссылается на столбцы внешнего запроса и выполняется для каждой строки', 'Подзапрос, который выполняется один раз', 'Подзапрос, использующий только константы', 'Подзапрос с оператором UNION'],
      en: ['A subquery that references columns of the outer query and executes for each row', 'A subquery that executes only once', 'A subquery using only constants', 'A subquery with a UNION operator'],
    },
    correct: 0 as const,
    explanation: { ru: 'Коррелированный подзапрос ссылается на столбцы из внешнего запроса, поэтому концептуально выполняется для каждой строки внешнего запроса.', en: 'A correlated subquery references columns from the outer query, so it conceptually executes for each row of the outer query.' },
    difficulty: 'intermediate' as const,
    tags: ['sql', 'subquery', 'correlated'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Для чего используется конструкция WITH (CTE)?', en: 'What is the WITH clause (CTE) used for?' },
    options: {
      ru: ['Для создания именованного временного результата, доступного в основном запросе', 'Для создания постоянной таблицы', 'Для объявления переменных', 'Для создания индекса'],
      en: ['To create a named temporary result set accessible in the main query', 'To create a permanent table', 'To declare variables', 'To create an index'],
    },
    correct: 0 as const,
    explanation: { ru: 'CTE (Common Table Expression) — именованное выражение, определённое в WITH. Оно существует только в рамках одного запроса и улучшает читаемость.', en: 'A CTE (Common Table Expression) is a named expression defined with WITH. It exists only within a single query and improves readability.' },
    difficulty: 'intermediate' as const,
    tags: ['sql', 'cte', 'with'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Что обязательно должно быть в рекурсивном CTE?', en: 'What must a recursive CTE contain?' },
    options: {
      ru: ['Базовый (anchor) запрос и рекурсивный (recursive) запрос, объединённые через UNION ALL', 'Только один SELECT с ключевым словом RECURSIVE', 'Вложенный подзапрос с LIMIT', 'Переменная-счётчик итераций'],
      en: ['An anchor query and a recursive query combined with UNION ALL', 'Only a single SELECT with the RECURSIVE keyword', 'A nested subquery with LIMIT', 'An iteration counter variable'],
    },
    correct: 0 as const,
    explanation: { ru: 'Рекурсивный CTE состоит из anchor-части (базовый случай) и recursive-части, соединённых UNION ALL. Рекурсия останавливается, когда рекурсивная часть возвращает 0 строк.', en: 'A recursive CTE consists of an anchor part (base case) and a recursive part connected by UNION ALL. Recursion stops when the recursive part returns 0 rows.' },
    difficulty: 'intermediate-advanced' as const,
    tags: ['sql', 'cte', 'recursive'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Чем UNION отличается от UNION ALL?', en: 'How does UNION differ from UNION ALL?' },
    options: {
      ru: ['UNION удаляет дубликаты, UNION ALL оставляет все строки', 'UNION ALL удаляет дубликаты', 'UNION объединяет столбцы, UNION ALL — строки', 'Нет разницы в результате'],
      en: ['UNION removes duplicates, UNION ALL keeps all rows', 'UNION ALL removes duplicates', 'UNION combines columns, UNION ALL combines rows', 'No difference in the result'],
    },
    correct: 0 as const,
    explanation: { ru: 'UNION выполняет неявный DISTINCT — удаляет повторяющиеся строки. UNION ALL возвращает все строки без дедупликации и поэтому работает быстрее.', en: 'UNION performs an implicit DISTINCT — it removes duplicate rows. UNION ALL returns all rows without deduplication and is therefore faster.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['sql', 'union', 'union-all'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Что делает оконная функция ROW_NUMBER()?', en: 'What does the ROW_NUMBER() window function do?' },
    options: {
      ru: ['Назначает уникальный последовательный номер каждой строке в окне', 'Считает общее количество строк', 'Возвращает ранг с пропусками при дубликатах', 'Возвращает номер строки в исходной таблице'],
      en: ['Assigns a unique sequential number to each row within a window', 'Counts the total number of rows', 'Returns a rank with gaps for duplicates', 'Returns the row number in the original table'],
    },
    correct: 0 as const,
    explanation: { ru: 'ROW_NUMBER() присваивает уникальный номер каждой строке в окне (PARTITION BY + ORDER BY). Дубликаты по ORDER BY получают разные номера.', en: 'ROW_NUMBER() assigns a unique number to each row within a window (PARTITION BY + ORDER BY). Ties in ORDER BY get different numbers.' },
    difficulty: 'intermediate' as const,
    tags: ['sql', 'window-function', 'row-number'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Чем RANK() отличается от DENSE_RANK()?', en: 'How does RANK() differ from DENSE_RANK()?' },
    options: {
      ru: ['RANK() оставляет пропуски после дубликатов, DENSE_RANK() — нет', 'DENSE_RANK() оставляет пропуски, RANK() — нет', 'Они всегда возвращают одинаковый результат', 'RANK() работает только с числовыми столбцами'],
      en: ['RANK() leaves gaps after duplicates, DENSE_RANK() does not', 'DENSE_RANK() leaves gaps, RANK() does not', 'They always return the same result', 'RANK() works only with numeric columns'],
    },
    correct: 0 as const,
    explanation: { ru: 'При одинаковых значениях RANK() назначает одинаковый ранг, но следующий ранг пропускается (1,1,3). DENSE_RANK() не пропускает (1,1,2).', en: 'For tied values RANK() assigns the same rank but skips the next (1,1,3). DENSE_RANK() does not skip (1,1,2).' },
    difficulty: 'intermediate' as const,
    tags: ['sql', 'window-function', 'rank', 'dense-rank'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Что делает оконная функция LAG()?', en: 'What does the LAG() window function do?' },
    options: {
      ru: ['Возвращает значение из предыдущей строки в окне', 'Возвращает значение из следующей строки', 'Вычисляет отставание текущего значения от максимума', 'Считает количество строк до текущей'],
      en: ['Returns the value from the previous row in the window', 'Returns the value from the next row', 'Calculates the lag of the current value from the maximum', 'Counts the number of rows before the current one'],
    },
    correct: 0 as const,
    explanation: { ru: 'LAG(column, offset, default) возвращает значение столбца из строки, которая находится на offset позиций раньше текущей в окне.', en: 'LAG(column, offset, default) returns the column value from the row that is offset positions before the current one in the window.' },
    difficulty: 'intermediate' as const,
    tags: ['sql', 'window-function', 'lag'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Для чего используется PARTITION BY в оконных функциях?', en: 'What is PARTITION BY used for in window functions?' },
    options: {
      ru: ['Для разделения строк на группы (окна), внутри которых работает функция', 'Для физического разделения таблицы на партиции', 'Для замены GROUP BY', 'Для ограничения числа строк в результате'],
      en: ['To divide rows into groups (windows) within which the function operates', 'To physically partition the table', 'To replace GROUP BY', 'To limit the number of rows in the result'],
    },
    correct: 0 as const,
    explanation: { ru: 'PARTITION BY делит результат на группы. Оконная функция вычисляется отдельно для каждой группы, при этом строки не схлопываются как в GROUP BY.', en: 'PARTITION BY divides the result into groups. The window function is computed separately for each group without collapsing rows like GROUP BY.' },
    difficulty: 'intermediate' as const,
    tags: ['sql', 'window-function', 'partition-by'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Что возвращает CASE WHEN условие THEN значение ELSE другое END?', en: 'What does CASE WHEN condition THEN value ELSE other END return?' },
    options: {
      ru: ['Значение, соответствующее первому истинному условию, или ELSE-значение', 'Всегда первое значение THEN', 'Количество истинных условий', 'Булево значение TRUE или FALSE'],
      en: ['The value corresponding to the first true condition, or the ELSE value', 'Always the first THEN value', 'The count of true conditions', 'A boolean value TRUE or FALSE'],
    },
    correct: 0 as const,
    explanation: { ru: 'CASE проверяет условия последовательно и возвращает значение первого истинного WHEN. Если ни одно не истинно, возвращается ELSE (или NULL, если ELSE не указан).', en: 'CASE checks conditions sequentially and returns the value of the first true WHEN. If none is true, it returns ELSE (or NULL if ELSE is omitted).' },
    difficulty: 'basic-intermediate' as const,
    tags: ['sql', 'case-when', 'conditional'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Что возвращает COALESCE(NULL, NULL, 42, 100)?', en: 'What does COALESCE(NULL, NULL, 42, 100) return?' },
    options: {
      ru: ['42', 'NULL', '100', 'Ошибку'],
      en: ['42', 'NULL', '100', 'An error'],
    },
    correct: 0 as const,
    explanation: { ru: 'COALESCE возвращает первое не-NULL значение из списка аргументов. В данном случае это 42.', en: 'COALESCE returns the first non-NULL value from the argument list. In this case, it is 42.' },
    difficulty: 'basic' as const,
    tags: ['sql', 'coalesce', 'null'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-queries', quizId: null,
    question: { ru: 'Что вернёт выражение NULL = NULL в SQL?', en: 'What does the expression NULL = NULL return in SQL?' },
    options: {
      ru: ['NULL (не TRUE и не FALSE)', 'TRUE', 'FALSE', 'Ошибку синтаксиса'],
      en: ['NULL (neither TRUE nor FALSE)', 'TRUE', 'FALSE', 'A syntax error'],
    },
    correct: 0 as const,
    explanation: { ru: 'В SQL любое сравнение с NULL (включая NULL = NULL) возвращает NULL, а не TRUE. Для проверки на NULL используется IS NULL / IS NOT NULL.', en: 'In SQL any comparison with NULL (including NULL = NULL) returns NULL, not TRUE. Use IS NULL / IS NOT NULL to check for NULL.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['sql', 'null', 'comparison'],
  },
]

// ── SQL: Indexes (20 questions) ─────────────────────────────────────────────
const questionsSqlIndexes: BilingualQuestion[] = [
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'Какая структура данных чаще всего используется для индексов в реляционных СУБД?', en: 'What data structure is most commonly used for indexes in relational databases?' },
    options: {
      ru: ['B-tree (сбалансированное дерево)', 'Хеш-таблица', 'Связный список', 'Красно-чёрное дерево'],
      en: ['B-tree (balanced tree)', 'Hash table', 'Linked list', 'Red-black tree'],
    },
    correct: 0 as const,
    explanation: { ru: 'B-tree — основная структура индексов в PostgreSQL, MySQL и большинстве СУБД. Она обеспечивает O(log N) для поиска и поддерживает диапазонные запросы.', en: 'B-tree is the primary index structure in PostgreSQL, MySQL, and most databases. It provides O(log N) lookup and supports range queries.' },
    difficulty: 'basic' as const,
    tags: ['indexes', 'b-tree', 'data-structure'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'Когда индекс НЕ будет использован оптимизатором?', en: 'When will the optimizer NOT use an index?' },
    options: {
      ru: ['Когда выбирается большая часть строк таблицы (low selectivity)', 'Когда таблица содержит более 1 миллиона строк', 'Когда запрос содержит WHERE', 'Когда индекс был создан менее часа назад'],
      en: ['When a large portion of the table rows is selected (low selectivity)', 'When the table has more than 1 million rows', 'When the query contains WHERE', 'When the index was created less than an hour ago'],
    },
    correct: 0 as const,
    explanation: { ru: 'Если запрос выбирает значительную часть таблицы, sequential scan эффективнее, так как избегает случайного чтения по индексу.', en: 'If the query selects a significant portion of the table, a sequential scan is more efficient because it avoids random reads through the index.' },
    difficulty: 'intermediate' as const,
    tags: ['indexes', 'selectivity', 'optimizer'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'Что такое правило левого префикса (leftmost prefix rule) в составном индексе?', en: 'What is the leftmost prefix rule in a composite index?' },
    options: {
      ru: ['Индекс (a, b, c) можно использовать для запросов по (a), (a,b) или (a,b,c), но не по (b) или (c) отдельно', 'Нужно всегда фильтровать по первому столбцу с помощью LIKE', 'Левый столбец индекса должен быть строковым', 'Индекс работает только если фильтруются все столбцы'],
      en: ['Index (a, b, c) can be used for queries on (a), (a,b), or (a,b,c), but not on (b) or (c) alone', 'You must always filter the first column with LIKE', 'The left column of the index must be a string type', 'The index only works if all columns are filtered'],
    },
    correct: 0 as const,
    explanation: { ru: 'Составной индекс по (a, b, c) хранит данные, упорядоченные сначала по a, потом по b, потом по c. Поэтому он полезен только при фильтрации с левого столбца.', en: 'A composite index on (a, b, c) stores data ordered first by a, then b, then c. Therefore it is useful only when filtering from the leftmost column.' },
    difficulty: 'intermediate' as const,
    tags: ['indexes', 'composite', 'leftmost-prefix'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'Что такое покрывающий индекс (covering index)?', en: 'What is a covering index?' },
    options: {
      ru: ['Индекс, содержащий все столбцы, необходимые для выполнения запроса, без обращения к таблице', 'Индекс, покрывающий все строки таблицы', 'Индекс по всем столбцам таблицы', 'Индекс, который автоматически обновляется'],
      en: ['An index containing all columns needed to execute a query without accessing the table', 'An index covering all rows of the table', 'An index on all columns of the table', 'An index that automatically updates itself'],
    },
    correct: 0 as const,
    explanation: { ru: 'Покрывающий индекс содержит все необходимые столбцы, позволяя выполнить запрос только по индексу (index-only scan) без чтения основной таблицы.', en: 'A covering index contains all needed columns, allowing the query to run as an index-only scan without reading the main table.' },
    difficulty: 'intermediate' as const,
    tags: ['indexes', 'covering', 'index-only-scan'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'Что такое частичный индекс (partial index)?', en: 'What is a partial index?' },
    options: {
      ru: ['Индекс, построенный только по строкам, удовлетворяющим условию WHERE', 'Индекс на часть столбцов составного ключа', 'Индекс, который ещё не полностью построен', 'Индекс, работающий только на чтение'],
      en: ['An index built only on rows that satisfy a WHERE condition', 'An index on some columns of a composite key', 'An index that is not yet fully built', 'An index that works only for reads'],
    },
    correct: 0 as const,
    explanation: { ru: 'Частичный индекс (CREATE INDEX ... WHERE condition) индексирует только подмножество строк. Это экономит место и ускоряет запросы к этому подмножеству.', en: 'A partial index (CREATE INDEX ... WHERE condition) indexes only a subset of rows. This saves space and speeds up queries on that subset.' },
    difficulty: 'intermediate' as const,
    tags: ['indexes', 'partial', 'conditional'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'Чем уникальный индекс отличается от обычного?', en: 'How does a unique index differ from a regular one?' },
    options: {
      ru: ['Запрещает вставку дублирующих значений в индексированные столбцы', 'Работает быстрее обычного индекса', 'Может быть только один на таблицу', 'Автоматически удаляет дубликаты'],
      en: ['Prevents inserting duplicate values into the indexed columns', 'Is faster than a regular index', 'Can only be one per table', 'Automatically removes duplicates'],
    },
    correct: 0 as const,
    explanation: { ru: 'UNIQUE INDEX гарантирует уникальность значений. При попытке вставить дубликат СУБД вернёт ошибку.', en: 'A UNIQUE INDEX guarantees value uniqueness. Attempting to insert a duplicate will result in a database error.' },
    difficulty: 'basic' as const,
    tags: ['indexes', 'unique', 'constraint'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'В чём разница между кластеризованным и некластеризованным индексом?', en: 'What is the difference between a clustered and non-clustered index?' },
    options: {
      ru: ['Кластеризованный определяет физический порядок данных в таблице, некластеризованный — нет', 'Кластеризованный работает только с числовыми столбцами', 'Некластеризованный быстрее на вставку', 'Разницы нет в PostgreSQL'],
      en: ['Clustered determines the physical order of data in the table, non-clustered does not', 'Clustered works only with numeric columns', 'Non-clustered is faster for inserts', 'There is no difference in PostgreSQL'],
    },
    correct: 0 as const,
    explanation: { ru: 'Кластеризованный индекс определяет физический порядок строк на диске. Таблица может иметь только один кластеризованный индекс. В PostgreSQL аналог — CLUSTER.', en: 'A clustered index determines the physical order of rows on disk. A table can have only one clustered index. In PostgreSQL the equivalent is CLUSTER.' },
    difficulty: 'intermediate' as const,
    tags: ['indexes', 'clustered', 'non-clustered'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'Что показывает команда EXPLAIN ANALYZE?', en: 'What does the EXPLAIN ANALYZE command show?' },
    options: {
      ru: ['План выполнения запроса с реальным временем и количеством строк', 'Только оценочный план без выполнения', 'Список индексов таблицы', 'Статистику по столбцам таблицы'],
      en: ['The query execution plan with actual time and row counts', 'Only an estimated plan without execution', 'A list of table indexes', 'Column statistics for the table'],
    },
    correct: 0 as const,
    explanation: { ru: 'EXPLAIN ANALYZE действительно выполняет запрос и показывает фактическое время и количество строк на каждом шаге плана. EXPLAIN без ANALYZE показывает только оценку.', en: 'EXPLAIN ANALYZE actually executes the query and shows real time and row counts at each plan step. EXPLAIN without ANALYZE shows only estimates.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['indexes', 'explain', 'analyze'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'Чем Seq Scan отличается от Index Scan в плане запроса?', en: 'How does Seq Scan differ from Index Scan in a query plan?' },
    options: {
      ru: ['Seq Scan читает всю таблицу последовательно, Index Scan использует индекс для поиска нужных строк', 'Seq Scan всегда медленнее', 'Index Scan читает таблицу целиком через индекс', 'Seq Scan доступен только для таблиц без индексов'],
      en: ['Seq Scan reads the entire table sequentially, Index Scan uses an index to find specific rows', 'Seq Scan is always slower', 'Index Scan reads the entire table through an index', 'Seq Scan is only available for tables without indexes'],
    },
    correct: 0 as const,
    explanation: { ru: 'Seq Scan полностью сканирует таблицу. Index Scan использует индекс для нахождения конкретных строк, что быстрее при высокой селективности.', en: 'Seq Scan fully scans the table. Index Scan uses an index to find specific rows, which is faster with high selectivity.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['indexes', 'seq-scan', 'index-scan'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'Что такое Index Only Scan?', en: 'What is an Index Only Scan?' },
    options: {
      ru: ['Сканирование, при котором все данные берутся из индекса без обращения к таблице', 'Сканирование, при котором используется только один индекс', 'Первый проход по индексу для оценки плана', 'Сканирование индекса для проверки его целостности'],
      en: ['A scan where all data is retrieved from the index without accessing the table', 'A scan that uses only one index', 'The first pass through an index for plan estimation', 'An index scan for integrity checking'],
    },
    correct: 0 as const,
    explanation: { ru: 'Index Only Scan возможен, когда индекс содержит все столбцы, нужные запросу (покрывающий индекс). Это самый быстрый вид доступа.', en: 'An Index Only Scan is possible when the index contains all columns needed by the query (covering index). This is the fastest access method.' },
    difficulty: 'intermediate' as const,
    tags: ['indexes', 'index-only-scan', 'covering'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'Что такое проблема N+1 запросов?', en: 'What is the N+1 query problem?' },
    options: {
      ru: ['Выполнение 1 запроса для списка и N дополнительных запросов для каждого элемента', 'Выполнение N параллельных запросов', 'Запрос, возвращающий N+1 столбцов', 'Проблема с индексом на N+1 столбцах'],
      en: ['Executing 1 query for a list and N additional queries for each item', 'Executing N parallel queries', 'A query returning N+1 columns', 'A problem with an index on N+1 columns'],
    },
    correct: 0 as const,
    explanation: { ru: 'N+1 — антипаттерн, когда ORM выполняет 1 запрос на список и по одному запросу на каждый связанный объект. Решение: JOIN, batch loading или preload.', en: 'N+1 is an anti-pattern where an ORM executes 1 query for the list and one query per related object. Solutions: JOIN, batch loading, or preload.' },
    difficulty: 'intermediate' as const,
    tags: ['indexes', 'n-plus-one', 'performance'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'Как batch loading помогает решить проблему N+1?', en: 'How does batch loading help solve the N+1 problem?' },
    options: {
      ru: ['Загружает связанные объекты одним запросом с IN (...) вместо N отдельных запросов', 'Кеширует результаты первого запроса', 'Создаёт временный индекс на время запроса', 'Выполняет запросы параллельно'],
      en: ['Loads related objects in one query with IN (...) instead of N separate queries', 'Caches the results of the first query', 'Creates a temporary index for the query', 'Executes queries in parallel'],
    },
    correct: 0 as const,
    explanation: { ru: 'Batch loading объединяет идентификаторы и выполняет один запрос WHERE id IN (1,2,3,...) вместо N отдельных SELECT по каждому id.', en: 'Batch loading collects IDs and executes one WHERE id IN (1,2,3,...) query instead of N separate SELECTs for each id.' },
    difficulty: 'intermediate' as const,
    tags: ['indexes', 'batch-loading', 'n-plus-one'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'Что такое индекс на выражении (expression index)?', en: 'What is an expression index (index on expression)?' },
    options: {
      ru: ['Индекс, построенный по результату выражения или функции, например LOWER(email)', 'Индекс, который содержит SQL-выражение для фильтрации', 'Индекс, автоматически создаваемый при SELECT', 'Индекс на вычисляемый столбец, хранимый в таблице'],
      en: ['An index built on the result of an expression or function, e.g., LOWER(email)', 'An index containing a SQL expression for filtering', 'An index automatically created on SELECT', 'An index on a computed column stored in the table'],
    },
    correct: 0 as const,
    explanation: { ru: 'Expression index (CREATE INDEX ON t (LOWER(email))) индексирует результат выражения. Запрос WHERE LOWER(email) = ... сможет использовать этот индекс.', en: 'An expression index (CREATE INDEX ON t (LOWER(email))) indexes the result of an expression. A query WHERE LOWER(email) = ... can use this index.' },
    difficulty: 'intermediate-advanced' as const,
    tags: ['indexes', 'expression', 'functional'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'Для чего используются GIN-индексы в PostgreSQL?', en: 'What are GIN indexes used for in PostgreSQL?' },
    options: {
      ru: ['Для полнотекстового поиска, JSONB, массивов и других составных типов', 'Только для числовых диапазонов', 'Для обычных строковых столбцов вместо B-tree', 'Для ускорения JOIN-операций'],
      en: ['For full-text search, JSONB, arrays, and other composite types', 'Only for numeric ranges', 'For regular string columns instead of B-tree', 'For speeding up JOIN operations'],
    },
    correct: 0 as const,
    explanation: { ru: 'GIN (Generalized Inverted Index) эффективен для поиска по составным значениям: полнотекстовый поиск (tsvector), JSONB, массивы.', en: 'GIN (Generalized Inverted Index) is efficient for searching composite values: full-text search (tsvector), JSONB, arrays.' },
    difficulty: 'intermediate-advanced' as const,
    tags: ['indexes', 'gin', 'full-text-search'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'Какой основной негативный эффект индексов на производительность записи?', en: 'What is the main negative effect of indexes on write performance?' },
    options: {
      ru: ['Каждый INSERT/UPDATE/DELETE должен обновить все затронутые индексы (write amplification)', 'Индексы блокируют таблицу при записи', 'Индексы удваивают размер транзакции', 'Индексы замедляют чтение при частой записи'],
      en: ['Every INSERT/UPDATE/DELETE must update all affected indexes (write amplification)', 'Indexes lock the table during writes', 'Indexes double the transaction size', 'Indexes slow down reads during frequent writes'],
    },
    correct: 0 as const,
    explanation: { ru: 'При каждой записи СУБД должна обновить данные в таблице и во всех затронутых индексах. Чем больше индексов, тем медленнее запись.', en: 'On every write the database must update data in the table and in all affected indexes. The more indexes, the slower the writes.' },
    difficulty: 'intermediate' as const,
    tags: ['indexes', 'write-amplification', 'performance'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'Что такое селективность (selectivity) индекса?', en: 'What is index selectivity?' },
    options: {
      ru: ['Отношение числа уникальных значений к общему числу строк — чем выше, тем эффективнее индекс', 'Количество столбцов в индексе', 'Скорость создания индекса', 'Процент таблицы, покрытый индексом'],
      en: ['The ratio of distinct values to total rows — the higher, the more effective the index', 'The number of columns in the index', 'The speed of index creation', 'The percentage of the table covered by the index'],
    },
    correct: 0 as const,
    explanation: { ru: 'Высокая селективность (много уникальных значений) делает индекс эффективным. Индекс на столбец boolean (2 значения) почти бесполезен.', en: 'High selectivity (many unique values) makes an index effective. An index on a boolean column (2 values) is almost useless.' },
    difficulty: 'intermediate' as const,
    tags: ['indexes', 'selectivity', 'cardinality'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'Что такое Bitmap Index Scan?', en: 'What is a Bitmap Index Scan?' },
    options: {
      ru: ['Двухэтапное сканирование: сначала по индексу собирается битовая карта страниц, затем читаются страницы таблицы', 'Сканирование индекса, хранящего данные в виде бит', 'Параллельное сканирование нескольких индексов', 'Сканирование, использующее bitmap-столбец'],
      en: ['A two-step scan: first a bitmap of pages is built from the index, then table pages are read', 'Scanning an index that stores data as bits', 'Parallel scanning of multiple indexes', 'A scan using a bitmap column'],
    },
    correct: 0 as const,
    explanation: { ru: 'Bitmap Index Scan строит битовую карту страниц, содержащих нужные строки, а затем читает эти страницы последовательно. Используется при средней селективности.', en: 'Bitmap Index Scan builds a bitmap of pages containing matching rows, then reads those pages sequentially. Used with medium selectivity.' },
    difficulty: 'intermediate-advanced' as const,
    tags: ['indexes', 'bitmap', 'scan'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'Какой синтаксис создания индекса в PostgreSQL?', en: 'What is the syntax for creating an index in PostgreSQL?' },
    options: {
      ru: ['CREATE INDEX idx_name ON table (column)', 'ADD INDEX idx_name TO table (column)', 'ALTER TABLE table ADD INDEX (column)', 'INDEX CREATE idx_name FOR table.column'],
      en: ['CREATE INDEX idx_name ON table (column)', 'ADD INDEX idx_name TO table (column)', 'ALTER TABLE table ADD INDEX (column)', 'INDEX CREATE idx_name FOR table.column'],
    },
    correct: 0 as const,
    explanation: { ru: 'Стандартный синтаксис: CREATE INDEX имя ON таблица (столбец). Можно добавить UNIQUE, CONCURRENTLY, WHERE и другие модификаторы.', en: 'Standard syntax: CREATE INDEX name ON table (column). You can add UNIQUE, CONCURRENTLY, WHERE, and other modifiers.' },
    difficulty: 'basic' as const,
    tags: ['indexes', 'create-index', 'syntax'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'По каким критериям выбирают столбцы для индексирования?', en: 'What criteria are used to choose which columns to index?' },
    options: {
      ru: ['Столбцы, часто используемые в WHERE, JOIN и ORDER BY, с высокой селективностью', 'Все столбцы таблицы для максимальной производительности', 'Только столбцы с типом INTEGER', 'Столбцы, которые никогда не обновляются'],
      en: ['Columns frequently used in WHERE, JOIN, and ORDER BY with high selectivity', 'All table columns for maximum performance', 'Only columns with INTEGER type', 'Columns that are never updated'],
    },
    correct: 0 as const,
    explanation: { ru: 'Индексируют столбцы, часто встречающиеся в WHERE, JOIN ON и ORDER BY. Важна высокая селективность и частота использования в запросах.', en: 'Index columns frequently appearing in WHERE, JOIN ON, and ORDER BY. High selectivity and query frequency are important.' },
    difficulty: 'intermediate' as const,
    tags: ['indexes', 'design', 'best-practices'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-indexes', quizId: null,
    question: { ru: 'Как влияет CREATE INDEX CONCURRENTLY на работу таблицы в PostgreSQL?', en: 'How does CREATE INDEX CONCURRENTLY affect table operations in PostgreSQL?' },
    options: {
      ru: ['Позволяет создавать индекс без блокировки записи в таблицу', 'Создаёт индекс быстрее за счёт параллелизма', 'Блокирует таблицу на время создания', 'Создаёт индекс в фоновом режиме с более низким приоритетом'],
      en: ['Allows creating an index without blocking writes to the table', 'Creates the index faster through parallelism', 'Locks the table during creation', 'Creates the index in the background with lower priority'],
    },
    correct: 0 as const,
    explanation: { ru: 'CREATE INDEX CONCURRENTLY строит индекс за два прохода без блокировки INSERT/UPDATE/DELETE. Обычный CREATE INDEX блокирует запись на всё время построения.', en: 'CREATE INDEX CONCURRENTLY builds the index in two passes without blocking INSERT/UPDATE/DELETE. Regular CREATE INDEX blocks writes for the entire build time.' },
    difficulty: 'intermediate-advanced' as const,
    tags: ['indexes', 'concurrently', 'postgresql'],
  },
]

// ── SQL: Transactions (20 questions) ────────────────────────────────────────
const questionsSqlTransactions: BilingualQuestion[] = [
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Что означает буква A в аббревиатуре ACID?', en: 'What does the letter A stand for in the ACID acronym?' },
    options: {
      ru: ['Atomicity (атомарность) — транзакция выполняется целиком или откатывается полностью', 'Availability (доступность)', 'Aggregation (агрегация)', 'Authentication (аутентификация)'],
      en: ['Atomicity — a transaction executes entirely or rolls back completely', 'Availability', 'Aggregation', 'Authentication'],
    },
    correct: 0 as const,
    explanation: { ru: 'Atomicity гарантирует, что все операции транзакции либо применяются, либо откатываются. Частичное применение невозможно.', en: 'Atomicity guarantees that all operations in a transaction are either applied or rolled back. Partial application is impossible.' },
    difficulty: 'basic' as const,
    tags: ['transactions', 'acid', 'atomicity'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Что гарантирует свойство Consistency в ACID?', en: 'What does the Consistency property guarantee in ACID?' },
    options: {
      ru: ['Транзакция переводит базу из одного корректного состояния в другое корректное состояние', 'Данные одинаковы на всех репликах', 'Все транзакции выполняются последовательно', 'Данные всегда доступны для чтения'],
      en: ['A transaction moves the database from one valid state to another valid state', 'Data is the same across all replicas', 'All transactions execute sequentially', 'Data is always available for reading'],
    },
    correct: 0 as const,
    explanation: { ru: 'Consistency означает, что транзакция не нарушает целостность данных — все ограничения (constraints, foreign keys) остаются валидными.', en: 'Consistency means that a transaction does not violate data integrity — all constraints (constraints, foreign keys) remain valid.' },
    difficulty: 'basic' as const,
    tags: ['transactions', 'acid', 'consistency'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Что гарантирует свойство Isolation в ACID?', en: 'What does the Isolation property guarantee in ACID?' },
    options: {
      ru: ['Параллельные транзакции не влияют друг на друга так, как если бы выполнялись последовательно', 'Транзакция изолирована от сбоев оборудования', 'Каждая транзакция работает с отдельной копией базы', 'Данные изолированы между таблицами'],
      en: ['Concurrent transactions do not affect each other as if they were executing sequentially', 'A transaction is isolated from hardware failures', 'Each transaction works with a separate copy of the database', 'Data is isolated between tables'],
    },
    correct: 0 as const,
    explanation: { ru: 'Isolation определяет, как параллельные транзакции видят изменения друг друга. Уровни изоляции регулируют компромисс между корректностью и производительностью.', en: 'Isolation defines how concurrent transactions see each other\'s changes. Isolation levels regulate the tradeoff between correctness and performance.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['transactions', 'acid', 'isolation'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Что гарантирует свойство Durability в ACID?', en: 'What does the Durability property guarantee in ACID?' },
    options: {
      ru: ['После COMMIT данные сохраняются даже при сбое системы', 'Данные хранятся вечно без удаления', 'Транзакция никогда не может быть отменена', 'База данных работает без перерывов'],
      en: ['After COMMIT, data persists even if the system crashes', 'Data is stored forever without deletion', 'A transaction can never be undone', 'The database operates without downtime'],
    },
    correct: 0 as const,
    explanation: { ru: 'Durability гарантирует, что зафиксированная (COMMIT) транзакция не будет потеряна даже при сбое питания или краше — данные записаны на диск (через WAL).', en: 'Durability guarantees that a committed transaction will not be lost even after a power failure or crash — data is written to disk (via WAL).' },
    difficulty: 'basic' as const,
    tags: ['transactions', 'acid', 'durability'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Какой уровень изоляции допускает грязное чтение (dirty read)?', en: 'Which isolation level allows dirty reads?' },
    options: {
      ru: ['READ UNCOMMITTED', 'READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'],
      en: ['READ UNCOMMITTED', 'READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'],
    },
    correct: 0 as const,
    explanation: { ru: 'READ UNCOMMITTED — самый низкий уровень. Транзакция может видеть незафиксированные изменения других транзакций (dirty read).', en: 'READ UNCOMMITTED is the lowest level. A transaction can see uncommitted changes from other transactions (dirty read).' },
    difficulty: 'intermediate' as const,
    tags: ['transactions', 'isolation', 'dirty-read'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Что такое неповторяемое чтение (non-repeatable read)?', en: 'What is a non-repeatable read?' },
    options: {
      ru: ['Повторный SELECT в одной транзакции возвращает другие данные, потому что другая транзакция обновила строку и зафиксировала', 'Запрос возвращает незафиксированные данные', 'Запрос возвращает новые строки, добавленные другой транзакцией', 'Запрос не может быть выполнен повторно из-за блокировки'],
      en: ['A repeated SELECT in the same transaction returns different data because another transaction updated a row and committed', 'A query returns uncommitted data', 'A query returns new rows added by another transaction', 'A query cannot be re-executed due to a lock'],
    },
    correct: 0 as const,
    explanation: { ru: 'Non-repeatable read возникает на уровне READ COMMITTED: между двумя одинаковыми SELECT другая транзакция может изменить и зафиксировать данные.', en: 'Non-repeatable read occurs at READ COMMITTED level: between two identical SELECTs another transaction can modify and commit data.' },
    difficulty: 'intermediate' as const,
    tags: ['transactions', 'isolation', 'non-repeatable-read'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Что такое фантомное чтение (phantom read)?', en: 'What is a phantom read?' },
    options: {
      ru: ['Повторный запрос в одной транзакции возвращает новые строки, добавленные и зафиксированные другой транзакцией', 'Чтение данных, которые уже удалены', 'Чтение незафиксированных данных', 'Чтение строк, изменённых другой транзакцией'],
      en: ['A repeated query in the same transaction returns new rows added and committed by another transaction', 'Reading data that has already been deleted', 'Reading uncommitted data', 'Reading rows modified by another transaction'],
    },
    correct: 0 as const,
    explanation: { ru: 'Phantom read — появление новых строк при повторном выполнении запроса с условием WHERE. Устраняется на уровне SERIALIZABLE.', en: 'A phantom read is the appearance of new rows when re-executing a query with a WHERE condition. It is eliminated at the SERIALIZABLE level.' },
    difficulty: 'intermediate' as const,
    tags: ['transactions', 'isolation', 'phantom-read'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Что такое MVCC (Multi-Version Concurrency Control)?', en: 'What is MVCC (Multi-Version Concurrency Control)?' },
    options: {
      ru: ['Механизм, при котором каждая транзакция видит свой снимок данных, а не блокирует строки', 'Протокол репликации между несколькими серверами', 'Система версионирования схемы базы', 'Механизм управления версиями SQL-запросов'],
      en: ['A mechanism where each transaction sees its own snapshot of data instead of locking rows', 'A replication protocol between multiple servers', 'A database schema versioning system', 'A SQL query version management mechanism'],
    },
    correct: 0 as const,
    explanation: { ru: 'MVCC позволяет читателям не блокировать писателей и наоборот. Каждая транзакция работает со своим «снимком» данных, созданным в момент начала транзакции.', en: 'MVCC allows readers not to block writers and vice versa. Each transaction works with its own data "snapshot" created at the transaction start.' },
    difficulty: 'intermediate' as const,
    tags: ['transactions', 'mvcc', 'concurrency'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Чем оптимистическая блокировка отличается от пессимистической?', en: 'How does optimistic locking differ from pessimistic locking?' },
    options: {
      ru: ['Оптимистическая не блокирует строки, а проверяет конфликт при фиксации; пессимистическая блокирует сразу', 'Оптимистическая быстрее во всех случаях', 'Пессимистическая не использует транзакции', 'Оптимистическая работает только с NoSQL'],
      en: ['Optimistic does not lock rows but checks for conflicts at commit time; pessimistic locks immediately', 'Optimistic is faster in all cases', 'Pessimistic does not use transactions', 'Optimistic works only with NoSQL'],
    },
    correct: 0 as const,
    explanation: { ru: 'Оптимистическая блокировка (через version/timestamp) не блокирует строки и проверяет конфликты при UPDATE. Пессимистическая (SELECT FOR UPDATE) сразу блокирует.', en: 'Optimistic locking (via version/timestamp) does not lock rows and checks conflicts at UPDATE time. Pessimistic (SELECT FOR UPDATE) locks immediately.' },
    difficulty: 'intermediate' as const,
    tags: ['transactions', 'locking', 'optimistic', 'pessimistic'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Что делает SELECT FOR UPDATE?', en: 'What does SELECT FOR UPDATE do?' },
    options: {
      ru: ['Блокирует выбранные строки для обновления до конца транзакции', 'Обновляет строки, найденные SELECT', 'Выбирает строки, которые были недавно обновлены', 'Создаёт временную таблицу для обновления'],
      en: ['Locks selected rows for update until the end of the transaction', 'Updates the rows found by SELECT', 'Selects rows that were recently updated', 'Creates a temporary table for updating'],
    },
    correct: 0 as const,
    explanation: { ru: 'SELECT FOR UPDATE устанавливает эксклюзивную блокировку на выбранные строки. Другие транзакции не смогут их изменить или заблокировать до завершения текущей.', en: 'SELECT FOR UPDATE places an exclusive lock on selected rows. Other transactions cannot modify or lock them until the current transaction completes.' },
    difficulty: 'intermediate' as const,
    tags: ['transactions', 'select-for-update', 'locking'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Что такое deadlock?', en: 'What is a deadlock?' },
    options: {
      ru: ['Ситуация, когда две транзакции взаимно ожидают освобождения блокировок друг друга', 'Блокировка всей таблицы одной транзакцией', 'Ошибка при превышении лимита блокировок', 'Зависание запроса из-за медленного диска'],
      en: ['A situation where two transactions are mutually waiting for each other to release locks', 'Locking an entire table by one transaction', 'An error when the lock limit is exceeded', 'A query hanging due to slow disk'],
    },
    correct: 0 as const,
    explanation: { ru: 'Deadlock: транзакция A ждёт блокировку, удерживаемую B, а B ждёт блокировку, удерживаемую A. СУБД обнаруживает deadlock и откатывает одну из транзакций.', en: 'Deadlock: transaction A waits for a lock held by B, and B waits for a lock held by A. The database detects the deadlock and rolls back one transaction.' },
    difficulty: 'intermediate' as const,
    tags: ['transactions', 'deadlock', 'locking'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Что такое двухфазный коммит (two-phase commit)?', en: 'What is a two-phase commit?' },
    options: {
      ru: ['Протокол для атомарной фиксации распределённой транзакции: фаза подготовки и фаза фиксации', 'Два последовательных COMMIT в одной транзакции', 'Механизм для ускорения записи на два диска', 'Способ объединить две транзакции в одну'],
      en: ['A protocol for atomic commit of a distributed transaction: prepare phase and commit phase', 'Two sequential COMMITs in one transaction', 'A mechanism to speed up writing to two disks', 'A way to combine two transactions into one'],
    },
    correct: 0 as const,
    explanation: { ru: '2PC: координатор сначала спрашивает участников «готовы?» (prepare), затем, если все готовы, отправляет commit. Гарантирует атомарность распределённых транзакций.', en: '2PC: the coordinator first asks participants "ready?" (prepare), then, if all are ready, sends commit. Guarantees atomicity of distributed transactions.' },
    difficulty: 'intermediate-advanced' as const,
    tags: ['transactions', 'two-phase-commit', 'distributed'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Для чего используется SAVEPOINT?', en: 'What is SAVEPOINT used for?' },
    options: {
      ru: ['Для создания точки внутри транзакции, к которой можно откатиться без отмены всей транзакции', 'Для сохранения транзакции на диск', 'Для создания резервной копии таблицы', 'Для фиксации части транзакции'],
      en: ['To create a point within a transaction that can be rolled back to without aborting the entire transaction', 'To save a transaction to disk', 'To create a table backup', 'To commit part of a transaction'],
    },
    correct: 0 as const,
    explanation: { ru: 'SAVEPOINT name создаёт точку сохранения. ROLLBACK TO name откатывает изменения до этой точки, не отменяя всю транзакцию.', en: 'SAVEPOINT name creates a save point. ROLLBACK TO name rolls back changes to that point without aborting the entire transaction.' },
    difficulty: 'intermediate' as const,
    tags: ['transactions', 'savepoint', 'rollback'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Что такое autocommit в контексте транзакций?', en: 'What is autocommit in the context of transactions?' },
    options: {
      ru: ['Режим, при котором каждый отдельный SQL-оператор автоматически фиксируется как транзакция', 'Автоматический COMMIT через определённый интервал', 'Режим, при котором транзакции не нужны', 'Механизм автоматического отката при ошибке'],
      en: ['A mode where each individual SQL statement is automatically committed as a transaction', 'Automatic COMMIT after a certain interval', 'A mode where transactions are not needed', 'A mechanism for automatic rollback on error'],
    },
    correct: 0 as const,
    explanation: { ru: 'При autocommit=true каждый отдельный оператор выполняется как неявная транзакция. Для группировки операций нужно явно начать транзакцию (BEGIN).', en: 'With autocommit=true each individual statement executes as an implicit transaction. To group operations, you must explicitly start a transaction (BEGIN).' },
    difficulty: 'basic-intermediate' as const,
    tags: ['transactions', 'autocommit'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Что такое WAL (Write-Ahead Log)?', en: 'What is WAL (Write-Ahead Log)?' },
    options: {
      ru: ['Журнал, куда записываются изменения до их применения к файлам данных, обеспечивая Durability', 'Лог всех SELECT-запросов для аудита', 'Файл для хранения плана выполнения запросов', 'Журнал ошибок базы данных'],
      en: ['A log where changes are written before being applied to data files, ensuring Durability', 'A log of all SELECT queries for auditing', 'A file for storing query execution plans', 'A database error log'],
    },
    correct: 0 as const,
    explanation: { ru: 'WAL гарантирует Durability: изменения сначала записываются в журнал, а затем в файлы данных. При сбое СУБД восстанавливает данные из WAL.', en: 'WAL guarantees Durability: changes are first written to the log, then to data files. On crash, the database recovers data from the WAL.' },
    difficulty: 'intermediate' as const,
    tags: ['transactions', 'wal', 'durability'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Что такое аномалия сериализации (serialization anomaly)?', en: 'What is a serialization anomaly?' },
    options: {
      ru: ['Результат параллельного выполнения транзакций, невозможный при последовательном выполнении', 'Ошибка при сериализации данных в JSON', 'Конфликт при конвертации типов данных', 'Проблема с порядком столбцов при INSERT'],
      en: ['A result of concurrent transaction execution that is impossible with sequential execution', 'An error when serializing data to JSON', 'A conflict when converting data types', 'A problem with column order during INSERT'],
    },
    correct: 0 as const,
    explanation: { ru: 'Serialization anomaly — результат, который не мог бы возникнуть при любом последовательном порядке тех же транзакций. Устраняется уровнем SERIALIZABLE.', en: 'A serialization anomaly is a result that could not occur with any sequential ordering of the same transactions. It is eliminated by the SERIALIZABLE level.' },
    difficulty: 'intermediate-advanced' as const,
    tags: ['transactions', 'serialization', 'anomaly'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Что такое advisory lock в PostgreSQL?', en: 'What is an advisory lock in PostgreSQL?' },
    options: {
      ru: ['Блокировка на уровне приложения, не связанная с конкретными строками или таблицами', 'Рекомендация СУБД по оптимизации блокировок', 'Блокировка, которая автоматически снимается через 5 секунд', 'Мягкая блокировка, которую можно игнорировать'],
      en: ['An application-level lock not tied to specific rows or tables', 'A database recommendation for lock optimization', 'A lock that is automatically released after 5 seconds', 'A soft lock that can be ignored'],
    },
    correct: 0 as const,
    explanation: { ru: 'Advisory locks — механизм PostgreSQL для пользовательских блокировок по числовому ключу. Используются для координации на уровне приложения (pg_advisory_lock).', en: 'Advisory locks are a PostgreSQL mechanism for user-defined locks by numeric key. Used for application-level coordination (pg_advisory_lock).' },
    difficulty: 'intermediate-advanced' as const,
    tags: ['transactions', 'advisory-lock', 'postgresql'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Какой уровень изоляции по умолчанию в PostgreSQL?', en: 'What is the default isolation level in PostgreSQL?' },
    options: {
      ru: ['READ COMMITTED', 'READ UNCOMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'],
      en: ['READ COMMITTED', 'READ UNCOMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'],
    },
    correct: 0 as const,
    explanation: { ru: 'PostgreSQL по умолчанию использует READ COMMITTED. На этом уровне каждый оператор видит только зафиксированные данные, но между операторами данные могут меняться.', en: 'PostgreSQL uses READ COMMITTED by default. At this level each statement sees only committed data, but data can change between statements.' },
    difficulty: 'intermediate' as const,
    tags: ['transactions', 'isolation', 'postgresql', 'default'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Что такое gap lock?', en: 'What is a gap lock?' },
    options: {
      ru: ['Блокировка диапазона между индексными записями, предотвращающая вставку новых строк в этот промежуток', 'Блокировка, возникающая при сетевых задержках', 'Промежуточное состояние блокировки между shared и exclusive', 'Блокировка пустых строк в таблице'],
      en: ['A lock on the gap between index records that prevents inserting new rows into that gap', 'A lock caused by network delays', 'An intermediate lock state between shared and exclusive', 'A lock on empty rows in a table'],
    },
    correct: 0 as const,
    explanation: { ru: 'Gap lock (в MySQL/InnoDB) блокирует промежуток между индексными записями, предотвращая phantom reads на уровне REPEATABLE READ.', en: 'A gap lock (in MySQL/InnoDB) locks the gap between index records, preventing phantom reads at the REPEATABLE READ level.' },
    difficulty: 'intermediate-advanced' as const,
    tags: ['transactions', 'gap-lock', 'mysql'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-transactions', quizId: null,
    question: { ru: 'Чем блокировка на уровне строки отличается от блокировки на уровне таблицы?', en: 'How does row-level locking differ from table-level locking?' },
    options: {
      ru: ['Row-level блокирует только затронутые строки, table-level — всю таблицу целиком', 'Row-level медленнее из-за дополнительных накладных расходов', 'Table-level блокирует только метаданные таблицы', 'Нет разницы в PostgreSQL'],
      en: ['Row-level locks only affected rows, table-level locks the entire table', 'Row-level is slower due to additional overhead', 'Table-level locks only table metadata', 'There is no difference in PostgreSQL'],
    },
    correct: 0 as const,
    explanation: { ru: 'Row-level блокировки (по умолчанию в InnoDB и PostgreSQL) обеспечивают высокий параллелизм, блокируя только нужные строки. Table-level блокировки проще, но сильно ограничивают конкурентность.', en: 'Row-level locks (default in InnoDB and PostgreSQL) provide high concurrency by locking only needed rows. Table-level locks are simpler but greatly limit concurrency.' },
    difficulty: 'intermediate' as const,
    tags: ['transactions', 'row-lock', 'table-lock'],
  },
]

// ── SQL: database/sql in Go (20 questions) ──────────────────────────────────
const questionsSqlGoDriver: BilingualQuestion[] = [
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Что происходит при вызове sql.Open()?', en: 'What happens when sql.Open() is called?' },
    options: {
      ru: ['Создаётся объект sql.DB (пул), но реальное соединение НЕ устанавливается', 'Открывается одно TCP-соединение с базой', 'Выполняется проверка доступности базы', 'Создаётся новая база данных'],
      en: ['A sql.DB object (pool) is created, but no actual connection is established', 'A single TCP connection to the database is opened', 'A database availability check is performed', 'A new database is created'],
    },
    correct: 0 as const,
    explanation: { ru: 'sql.Open() только создаёт объект пула и валидирует аргументы. Реальное подключение происходит лениво — при первом запросе или при вызове db.Ping().', en: 'sql.Open() only creates the pool object and validates arguments. The actual connection happens lazily — on the first query or when db.Ping() is called.' },
    difficulty: 'basic' as const,
    tags: ['go-sql', 'sql-open', 'lazy-connect'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Что представляет собой sql.DB в Go?', en: 'What does sql.DB represent in Go?' },
    options: {
      ru: ['Пул соединений с базой данных, а не одно соединение', 'Одно TCP-соединение с базой', 'Объект базы данных в памяти', 'Файловый дескриптор базы'],
      en: ['A connection pool to the database, not a single connection', 'A single TCP connection to the database', 'An in-memory database object', 'A file descriptor for the database'],
    },
    correct: 0 as const,
    explanation: { ru: 'sql.DB — это пул соединений. Он безопасен для конкурентного использования, управляет открытием/закрытием соединений и их повторным использованием.', en: 'sql.DB is a connection pool. It is safe for concurrent use, manages opening/closing connections, and reuses them.' },
    difficulty: 'basic' as const,
    tags: ['go-sql', 'sql-db', 'connection-pool'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Для чего используется db.Ping()?', en: 'What is db.Ping() used for?' },
    options: {
      ru: ['Для проверки реальной доступности базы данных (устанавливает соединение)', 'Для отправки SQL-запроса', 'Для измерения задержки (latency)', 'Для сброса пула соединений'],
      en: ['To verify actual database availability (establishes a connection)', 'To send a SQL query', 'To measure latency', 'To reset the connection pool'],
    },
    correct: 0 as const,
    explanation: { ru: 'db.Ping() заставляет sql.DB установить реальное соединение с базой. Используется после sql.Open() для проверки, что база доступна.', en: 'db.Ping() forces sql.DB to establish a real connection to the database. Used after sql.Open() to verify that the database is accessible.' },
    difficulty: 'basic' as const,
    tags: ['go-sql', 'ping', 'connectivity'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Что возвращает db.Query()?', en: 'What does db.Query() return?' },
    options: {
      ru: ['*sql.Rows — итератор по результатам, который необходимо закрыть (rows.Close())', 'Срез структур с результатами', 'Одну строку результата', 'Количество затронутых строк'],
      en: ['*sql.Rows — a result iterator that must be closed (rows.Close())', 'A slice of structs with results', 'A single result row', 'The number of affected rows'],
    },
    correct: 0 as const,
    explanation: { ru: 'db.Query() возвращает *sql.Rows — итератор. Вызов rows.Close() обязателен (обычно через defer), чтобы вернуть соединение в пул.', en: 'db.Query() returns *sql.Rows — an iterator. Calling rows.Close() is mandatory (usually via defer) to return the connection to the pool.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['go-sql', 'query', 'rows'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Чем db.QueryRow() отличается от db.Query()?', en: 'How does db.QueryRow() differ from db.Query()?' },
    options: {
      ru: ['QueryRow возвращает *sql.Row для одной строки и не требует явного Close()', 'QueryRow быстрее, потому что не создаёт итератор', 'QueryRow может возвращать несколько строк', 'QueryRow используется только для INSERT'],
      en: ['QueryRow returns *sql.Row for a single row and does not require explicit Close()', 'QueryRow is faster because it does not create an iterator', 'QueryRow can return multiple rows', 'QueryRow is used only for INSERT'],
    },
    correct: 0 as const,
    explanation: { ru: 'db.QueryRow() удобен для запросов, возвращающих одну строку. Он автоматически закрывает ресурсы после Scan().', en: 'db.QueryRow() is convenient for queries returning one row. It automatically closes resources after Scan().' },
    difficulty: 'basic-intermediate' as const,
    tags: ['go-sql', 'query-row', 'single-row'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Как rows.Scan() заполняет переменные?', en: 'How does rows.Scan() fill variables?' },
    options: {
      ru: ['Принимает указатели на переменные и записывает значения столбцов по порядку', 'Использует рефлексию для заполнения структуры по именам полей', 'Возвращает map[string]interface{}', 'Записывает данные в глобальный буфер'],
      en: ['Accepts pointers to variables and writes column values in order', 'Uses reflection to fill a struct by field names', 'Returns map[string]interface{}', 'Writes data to a global buffer'],
    },
    correct: 0 as const,
    explanation: { ru: 'rows.Scan(&var1, &var2, ...) принимает указатели и записывает значения столбцов по порядку. Количество аргументов должно совпадать с числом столбцов.', en: 'rows.Scan(&var1, &var2, ...) accepts pointers and writes column values in order. The number of arguments must match the number of columns.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['go-sql', 'scan', 'pointers'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Каков типичный паттерн итерации по rows?', en: 'What is the typical pattern for iterating over rows?' },
    options: {
      ru: ['for rows.Next() { rows.Scan(...) } с defer rows.Close() перед циклом', 'for range rows { ... }', 'while rows.HasNext() { rows.Get() }', 'rows.ForEach(func(row) { ... })'],
      en: ['for rows.Next() { rows.Scan(...) } with defer rows.Close() before the loop', 'for range rows { ... }', 'while rows.HasNext() { rows.Get() }', 'rows.ForEach(func(row) { ... })'],
    },
    correct: 0 as const,
    explanation: { ru: 'Стандартный паттерн: defer rows.Close(); for rows.Next() { err := rows.Scan(&...); ... }; if err := rows.Err(); err != nil { ... }', en: 'Standard pattern: defer rows.Close(); for rows.Next() { err := rows.Scan(&...); ... }; if err := rows.Err(); err != nil { ... }' },
    difficulty: 'basic' as const,
    tags: ['go-sql', 'iteration', 'rows-next'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Для чего используется db.Exec()?', en: 'What is db.Exec() used for?' },
    options: {
      ru: ['Для выполнения INSERT, UPDATE, DELETE и других запросов, не возвращающих строки', 'Только для DDL-запросов (CREATE, ALTER)', 'Для выполнения SELECT с автоматическим закрытием', 'Для выполнения хранимых процедур'],
      en: ['For executing INSERT, UPDATE, DELETE and other queries that do not return rows', 'Only for DDL queries (CREATE, ALTER)', 'For executing SELECT with automatic closing', 'For executing stored procedures'],
    },
    correct: 0 as const,
    explanation: { ru: 'db.Exec() возвращает sql.Result (с методами LastInsertId() и RowsAffected()). Используется для операций изменения данных.', en: 'db.Exec() returns sql.Result (with LastInsertId() and RowsAffected() methods). Used for data modification operations.' },
    difficulty: 'basic' as const,
    tags: ['go-sql', 'exec', 'insert-update-delete'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Что такое prepared statement (db.Prepare)?', en: 'What is a prepared statement (db.Prepare)?' },
    options: {
      ru: ['Предварительно скомпилированный SQL-запрос, который можно выполнять многократно с разными параметрами', 'Кешированный результат запроса', 'SQL-запрос, записанный в файл', 'Шаблон для генерации SQL'],
      en: ['A pre-compiled SQL query that can be executed multiple times with different parameters', 'A cached query result', 'A SQL query written to a file', 'A template for generating SQL'],
    },
    correct: 0 as const,
    explanation: { ru: 'db.Prepare() отправляет SQL на сервер для разбора и планирования. Затем stmt.Exec() / stmt.Query() выполняют его с параметрами без повторного разбора.', en: 'db.Prepare() sends SQL to the server for parsing and planning. Then stmt.Exec() / stmt.Query() execute it with parameters without re-parsing.' },
    difficulty: 'intermediate' as const,
    tags: ['go-sql', 'prepared-statement', 'prepare'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Для чего используются sql.NullString и sql.NullInt64?', en: 'What are sql.NullString and sql.NullInt64 used for?' },
    options: {
      ru: ['Для корректной обработки NULL-значений из базы, так как Go-типы не могут быть nil', 'Для оптимизации памяти при хранении строк', 'Для валидации входных данных', 'Для конвертации между типами Go и SQL'],
      en: ['To correctly handle NULL values from the database, since Go types cannot be nil', 'To optimize memory for string storage', 'To validate input data', 'To convert between Go and SQL types'],
    },
    correct: 0 as const,
    explanation: { ru: 'Go-примитивы (string, int64) не могут быть nil. sql.NullString содержит поля String и Valid: если Valid=false, значение было NULL.', en: 'Go primitives (string, int64) cannot be nil. sql.NullString contains String and Valid fields: if Valid=false, the value was NULL.' },
    difficulty: 'intermediate' as const,
    tags: ['go-sql', 'null', 'nullable'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Что делают SetMaxOpenConns и SetMaxIdleConns?', en: 'What do SetMaxOpenConns and SetMaxIdleConns do?' },
    options: {
      ru: ['Ограничивают максимальное количество открытых и простаивающих соединений в пуле', 'Устанавливают таймаут для запросов', 'Задают количество параллельных горутин для запросов', 'Определяют размер буфера для результатов'],
      en: ['Limit the maximum number of open and idle connections in the pool', 'Set the timeout for queries', 'Set the number of parallel goroutines for queries', 'Define the buffer size for results'],
    },
    correct: 0 as const,
    explanation: { ru: 'SetMaxOpenConns ограничивает общее число одновременных соединений. SetMaxIdleConns — число соединений, которые остаются открытыми для повторного использования.', en: 'SetMaxOpenConns limits the total number of simultaneous connections. SetMaxIdleConns limits connections that remain open for reuse.' },
    difficulty: 'intermediate' as const,
    tags: ['go-sql', 'pool', 'max-connections'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Зачем использовать QueryContext вместо Query?', en: 'Why use QueryContext instead of Query?' },
    options: {
      ru: ['QueryContext принимает context.Context для отмены и таймаутов', 'QueryContext быстрее, так как использует кеш', 'QueryContext поддерживает транзакции, а Query — нет', 'QueryContext возвращает типизированный результат'],
      en: ['QueryContext accepts a context.Context for cancellation and timeouts', 'QueryContext is faster because it uses a cache', 'QueryContext supports transactions, Query does not', 'QueryContext returns a typed result'],
    },
    correct: 0 as const,
    explanation: { ru: 'QueryContext(ctx, sql, args...) позволяет отменить запрос через context. Если контекст отменён, запрос прерывается и соединение возвращается в пул.', en: 'QueryContext(ctx, sql, args...) allows canceling a query via context. If the context is cancelled, the query is aborted and the connection is returned to the pool.' },
    difficulty: 'intermediate' as const,
    tags: ['go-sql', 'context', 'query-context'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Каков типичный паттерн работы с транзакциями в database/sql?', en: 'What is the typical transaction pattern in database/sql?' },
    options: {
      ru: ['tx, err := db.BeginTx(ctx, nil); defer tx.Rollback(); ... tx.Commit()', 'db.Transaction(func(tx) { ... })', 'db.Begin(); db.Query(...); db.Commit()', 'db.Exec("BEGIN"); ... db.Exec("COMMIT")'],
      en: ['tx, err := db.BeginTx(ctx, nil); defer tx.Rollback(); ... tx.Commit()', 'db.Transaction(func(tx) { ... })', 'db.Begin(); db.Query(...); db.Commit()', 'db.Exec("BEGIN"); ... db.Exec("COMMIT")'],
    },
    correct: 0 as const,
    explanation: { ru: 'Стандартный паттерн: BeginTx, defer Rollback (безопасно после Commit), выполнение запросов через tx, затем tx.Commit().', en: 'Standard pattern: BeginTx, defer Rollback (safe after Commit), execute queries via tx, then tx.Commit().' },
    difficulty: 'intermediate' as const,
    tags: ['go-sql', 'transaction', 'begin-commit'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Почему важно вызывать defer rows.Close()?', en: 'Why is it important to call defer rows.Close()?' },
    options: {
      ru: ['Чтобы вернуть соединение в пул; без Close() происходит утечка соединений', 'Чтобы зафиксировать результаты в кеше', 'Чтобы освободить память, занятую результатами', 'Чтобы отправить подтверждение серверу'],
      en: ['To return the connection to the pool; without Close() connections leak', 'To persist results in the cache', 'To free memory occupied by results', 'To send an acknowledgment to the server'],
    },
    correct: 0 as const,
    explanation: { ru: 'Если не вызвать rows.Close(), соединение не вернётся в пул. Это приведёт к исчерпанию пула и зависанию новых запросов.', en: 'If rows.Close() is not called, the connection will not return to the pool. This leads to pool exhaustion and new queries hanging.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['go-sql', 'rows-close', 'leak'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Почему database/sql не поддерживает сканирование в структуру напрямую?', en: 'Why does database/sql not support scanning directly into a struct?' },
    options: {
      ru: ['Стандартная библиотека минималистична: Scan работает с указателями на поля, для структур используют sqlx или ручной маппинг', 'Из-за ограничений рефлексии в Go', 'Потому что структуры Go не поддерживают NULL', 'Это запланировано в Go 2.0'],
      en: ['The standard library is minimalistic: Scan works with field pointers, for structs use sqlx or manual mapping', 'Due to Go reflection limitations', 'Because Go structs do not support NULL', 'This is planned for Go 2.0'],
    },
    correct: 0 as const,
    explanation: { ru: 'database/sql предоставляет только низкоуровневый Scan по указателям. Библиотеки sqlx (StructScan) и scany добавляют маппинг в структуры через рефлексию.', en: 'database/sql provides only low-level Scan by pointers. Libraries like sqlx (StructScan) and scany add struct mapping via reflection.' },
    difficulty: 'intermediate' as const,
    tags: ['go-sql', 'struct-scan', 'sqlx'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Что возвращает QueryRow().Scan() если строка не найдена?', en: 'What does QueryRow().Scan() return if no row is found?' },
    options: {
      ru: ['sql.ErrNoRows', 'nil', 'io.EOF', 'Пустую структуру с нулевыми значениями'],
      en: ['sql.ErrNoRows', 'nil', 'io.EOF', 'An empty struct with zero values'],
    },
    correct: 0 as const,
    explanation: { ru: 'Если QueryRow не нашёл строку, Scan() вернёт sql.ErrNoRows. Это не ошибка сервера, а ожидаемая ситуация, которую нужно обрабатывать отдельно.', en: 'If QueryRow finds no row, Scan() returns sql.ErrNoRows. This is not a server error but an expected situation that should be handled separately.' },
    difficulty: 'basic-intermediate' as const,
    tags: ['go-sql', 'err-no-rows', 'error-handling'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Чем отличается синтаксис плейсхолдеров $1 от ??', en: 'How does the placeholder syntax $1 differ from ??' },
    options: {
      ru: ['$1, $2 — нумерованные (PostgreSQL), ? — позиционные (MySQL); драйвер определяет синтаксис', 'Нет разницы — это синонимы', '$1 используется в prepared statements, ? — в обычных запросах', '? более безопасен, чем $1'],
      en: ['$1, $2 are numbered (PostgreSQL), ? are positional (MySQL); the driver determines the syntax', 'No difference — they are synonyms', '$1 is used in prepared statements, ? in regular queries', '? is more secure than $1'],
    },
    correct: 0 as const,
    explanation: { ru: 'PostgreSQL использует нумерованные плейсхолдеры ($1, $2), MySQL — позиционные (?). Выбор зависит от драйвера (lib/pq, pgx vs go-sql-driver/mysql).', en: 'PostgreSQL uses numbered placeholders ($1, $2), MySQL uses positional (?). The choice depends on the driver (lib/pq, pgx vs go-sql-driver/mysql).' },
    difficulty: 'intermediate' as const,
    tags: ['go-sql', 'placeholder', 'driver'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Как управляется жизненный цикл соединений в пуле sql.DB?', en: 'How is the connection lifecycle managed in the sql.DB pool?' },
    options: {
      ru: ['SetConnMaxLifetime и SetConnMaxIdleTime закрывают соединения по таймауту, предотвращая утечки', 'Соединения никогда не закрываются до вызова db.Close()', 'Каждый запрос создаёт новое соединение', 'Go runtime автоматически управляет соединениями через GC'],
      en: ['SetConnMaxLifetime and SetConnMaxIdleTime close connections by timeout, preventing leaks', 'Connections are never closed until db.Close() is called', 'Each query creates a new connection', 'Go runtime automatically manages connections via GC'],
    },
    correct: 0 as const,
    explanation: { ru: 'SetConnMaxLifetime ограничивает максимальное время жизни соединения. SetConnMaxIdleTime — максимальное время простоя. Это помогает избежать проблем с устаревшими соединениями.', en: 'SetConnMaxLifetime limits the maximum connection lifetime. SetConnMaxIdleTime limits the maximum idle time. This helps avoid issues with stale connections.' },
    difficulty: 'intermediate' as const,
    tags: ['go-sql', 'pool', 'lifetime'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Чем pgx отличается от стандартного database/sql?', en: 'How does pgx differ from the standard database/sql?' },
    options: {
      ru: ['pgx — нативный PostgreSQL-драйвер с расширенными возможностями (COPY, LISTEN/NOTIFY, пользовательские типы) помимо совместимости с database/sql', 'pgx полностью заменяет database/sql и не совместим с ним', 'pgx работает только с PostgreSQL 15+', 'pgx не поддерживает пул соединений'],
      en: ['pgx is a native PostgreSQL driver with extended features (COPY, LISTEN/NOTIFY, custom types) beyond database/sql compatibility', 'pgx completely replaces database/sql and is not compatible', 'pgx works only with PostgreSQL 15+', 'pgx does not support connection pooling'],
    },
    correct: 0 as const,
    explanation: { ru: 'pgx может работать как драйвер database/sql (pgx/stdlib) или напрямую с расширенными возможностями: COPY, LISTEN/NOTIFY, batch queries, пользовательские типы.', en: 'pgx can work as a database/sql driver (pgx/stdlib) or directly with extended features: COPY, LISTEN/NOTIFY, batch queries, custom types.' },
    difficulty: 'intermediate' as const,
    tags: ['go-sql', 'pgx', 'postgresql'],
  },
  {
    type: 'mcq' as const, blockId: 'sql-go-driver', quizId: null,
    question: { ru: 'Что такое sqlc?', en: 'What is sqlc?' },
    options: {
      ru: ['Инструмент кодогенерации: из SQL-запросов генерирует типобезопасный Go-код', 'ORM для Go, аналог GORM', 'SQL-компилятор для встраивания запросов в бинарник', 'Линтер для SQL-файлов'],
      en: ['A code generation tool: generates type-safe Go code from SQL queries', 'An ORM for Go, similar to GORM', 'A SQL compiler for embedding queries in binaries', 'A linter for SQL files'],
    },
    correct: 0 as const,
    explanation: { ru: 'sqlc читает SQL-файлы и schema, генерирует Go-структуры и функции с правильными типами. Нет рефлексии, нет ORM — чистый SQL.', en: 'sqlc reads SQL files and schema, generates Go structs and functions with correct types. No reflection, no ORM — pure SQL.' },
    difficulty: 'intermediate' as const,
    tags: ['go-sql', 'sqlc', 'codegen'],
  },
]

// ── Bilingual batches ───────────────────────────────────────────────────────
const bilingualBatches: Array<{ blockId: string; qs: BilingualQuestion[] }> = [
  { blockId: 'primitives-strings', qs: questionsPrimitivesStrings },
  { blockId: 'primitives-maps', qs: questionsPrimitivesMaps },
  { blockId: 'primitives-slices', qs: questionsPrimitivesSlices },
  { blockId: 'primitives-interfaces', qs: questionsPrimitivesInterfaces },
  { blockId: 'oop-solid', qs: questionsOopSolid },
  { blockId: 'oop-patterns', qs: questionsOopPatterns },
  { blockId: 'oop-embedding', qs: questionsOopEmbedding },
  { blockId: 'oop-di', qs: questionsOopDI },
  { blockId: 'concurrency-goroutines', qs: questionsConcurrencyGoroutines },
  { blockId: 'concurrency-channels', qs: questionsConcurrencyChannels },
  { blockId: 'concurrency-sync', qs: questionsConcurrencySync },
  { blockId: 'concurrency-context', qs: questionsConcurrencyContext },
  { blockId: 'sql-queries', qs: questionsSqlQueries },
  { blockId: 'sql-indexes', qs: questionsSqlIndexes },
  { blockId: 'sql-transactions', qs: questionsSqlTransactions },
  { blockId: 'sql-go-driver', qs: questionsSqlGoDriver },
]

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
    { quizId: 7, qs: questionsServer as LegacyQuestion[] },
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

  console.log(`\n[seed] Done (legacy): ${total} total, ${inserted} inserted, ${updated} updated`)

  // ── Seed bilingual questions ──────────────────────────────────────────────────
  console.log('\n[seed] Seeding bilingual questions...')
  for (const { blockId, qs } of bilingualBatches) {
    for (const q of qs) {
      const now = new Date()
      const doc = {
        type: q.type,
        quizId: null as number | null,
        blockId,
        question: q.question,
        ...(q.code ? { code: q.code } : {}),
        options: q.options,
        correct: q.correct,
        explanation: q.explanation,
        difficulty: q.difficulty,
        tags: q.tags,
        createdAt: now,
        updatedAt: now,
      }
      await questionsCol.updateOne(
        { blockId, 'question.ru': q.question.ru },
        { $set: { ...doc, updatedAt: new Date() }, $setOnInsert: { _id: new ObjectId() } },
        { upsert: true },
      )
      total++
      inserted++
    }
    console.log(`[seed] Block ${blockId}: ${qs.length} bilingual questions processed`)
  }

  console.log(`\n[seed] Done (total): ${total} processed`)

  // ── Create indexes ─────────────────────────────────────────────────────────
  await questionsCol.createIndex({ quizId: 1 })
  await questionsCol.createIndex({ blockId: 1 })
  await questionsCol.createIndex({ legacyId: 1, quizId: 1 }, { unique: true })
  await blocksCol.createIndex({ blockId: 1 }, { unique: true })
  await blocksCol.createIndex({ parentBlockId: 1 })
  console.log('[seed] Indexes created')

  await client.close()
}

main().catch((err) => {
  console.error('[seed] Error:', err)
  process.exit(1)
})
