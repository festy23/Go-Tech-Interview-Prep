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

// ── Bilingual batches ───────────────────────────────────────────────────────
const bilingualBatches: Array<{ blockId: string; qs: BilingualQuestion[] }> = [
  { blockId: 'primitives-strings', qs: questionsPrimitivesStrings },
  { blockId: 'primitives-maps', qs: questionsPrimitivesMaps },
  { blockId: 'primitives-slices', qs: questionsPrimitivesSlices },
  { blockId: 'primitives-interfaces', qs: questionsPrimitivesInterfaces },
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
