# Data-Driven Quiz Addition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make adding a new quiz a pure data operation — only `seed.ts` needs editing, no code changes required.

**Architecture:** Relax `quizId` from a `1|2|...|6` literal union to `number` in all schemas and types. Add `subtitle: { ru, en }` to block documents in MongoDB. Frontend derives all quiz card display data (title, subtitle, topics) directly from the `BlockDTO` returned by the API instead of i18n JSON keys.

**Tech Stack:** Zod (shared schemas), MongoDB (entities), Hono (backend), React 19 + Vite (frontend), i18next (i18n), pnpm monorepo

---

## Files Modified

| File | What changes |
|------|-------------|
| `quiz/packages/shared/src/schemas/question.ts` | quizId union → `z.number().int().positive()` in 3 schemas |
| `quiz/packages/shared/src/schemas/block.ts` | quizId union → number; add `subtitle: z.string()` |
| `quiz/packages/shared/src/schemas/progress.ts` | quizId union → `z.number().int().positive()` |
| `quiz/apps/backend/src/schemas/entities.ts` | quizId types + BlockEntity.subtitle + ProgressEntity |
| `quiz/apps/backend/src/services/blockService.ts` | toDTO: add subtitle extraction |
| `quiz/apps/backend/scripts/seed.ts` | add subtitle to each block; relax quizId literal types |
| `quiz/apps/frontend/src/data/blocks.ts` | `quizId?: number`; add `subtitle: string` to RoadmapBlock |
| `quiz/apps/frontend/src/api/client.ts` | `quizId?: number` in fetchQuestions params |
| `quiz/apps/frontend/src/App.tsx` | `activeQuizId: number\|null`; `startQuiz(quizId, title)` |
| `quiz/apps/frontend/src/Home.tsx` | `onStartQuiz(quizId, title)`; render quiz cards from block data |
| `quiz/apps/frontend/src/BlockDetail.tsx` | `onStartQuiz(quizId: number, title: string)` |
| `quiz/apps/frontend/src/locales/ru.json` | remove `quizCard.*` section |
| `quiz/apps/frontend/src/locales/en.json` | remove `quizCard.*` section |
| `quiz/CLAUDE.md` | update "Adding a new quizId" section |

---

## Task 1: Relax quizId in shared schemas + add subtitle to BlockDTO

**Files:**
- Modify: `quiz/packages/shared/src/schemas/question.ts`
- Modify: `quiz/packages/shared/src/schemas/block.ts`
- Modify: `quiz/packages/shared/src/schemas/progress.ts`

- [ ] **Step 1: Edit question.ts — relax all three quizId occurrences**

Replace the literal union in `BaseQuestionDTOSchema`, `CreateMCQQuestionSchema`, and `QuestionQuerySchema`:

In `quiz/packages/shared/src/schemas/question.ts`:

```typescript
// BaseQuestionDTOSchema — change:
  quizId: z.number().int().positive().nullable(),

// CreateMCQQuestionSchema — change:
  quizId: z.number().int().positive().nullable(),

// QuestionQuerySchema — change:
  quizId: z.coerce.number().int().positive().optional(),
```

Full file after changes:

```typescript
import { z } from 'zod'

export const LangSchema = z.enum(['ru', 'en'])
export type Lang = z.infer<typeof LangSchema>

export const DifficultyLevelSchema = z.enum([
  'basic',
  'basic-intermediate',
  'intermediate',
  'intermediate-advanced',
  'advanced',
])
export type DifficultyLevel = z.infer<typeof DifficultyLevelSchema>

const BaseQuestionDTOSchema = z.object({
  id: z.string(),
  quizId: z.number().int().positive().nullable(),
  blockId: z.string().nullable(),
  difficulty: DifficultyLevelSchema,
  tags: z.array(z.string()),
  explanation: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const MCQQuestionDTOSchema = BaseQuestionDTOSchema.extend({
  type: z.literal('mcq'),
  question: z.string(),
  code: z.string().optional(),
  options: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  correct: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
})
export type MCQQuestionDTO = z.infer<typeof MCQQuestionDTOSchema>

export const QuestionDTOSchema = z.discriminatedUnion('type', [
  MCQQuestionDTOSchema,
])
export type QuestionDTO = z.infer<typeof QuestionDTOSchema>

export const CreateMCQQuestionSchema = z.object({
  type: z.literal('mcq'),
  quizId: z.number().int().positive().nullable(),
  blockId: z.string().nullable(),
  question: z.string().min(5).max(2000),
  code: z.string().max(5000).optional(),
  options: z.tuple([
    z.string().min(1).max(500),
    z.string().min(1).max(500),
    z.string().min(1).max(500),
    z.string().min(1).max(500),
  ]),
  correct: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  explanation: z.string().min(5).max(3000),
  difficulty: DifficultyLevelSchema,
  tags: z.array(z.string().max(50)).max(20).default([]),
})
export type CreateMCQQuestionInput = z.infer<typeof CreateMCQQuestionSchema>

export const QuestionQuerySchema = z.object({
  quizId: z.coerce.number().int().positive().optional(),
  blockId: z.string().optional(),
  shuffle: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  lang: LangSchema.default('ru').optional(),
})
export type QuestionQuery = z.infer<typeof QuestionQuerySchema>
```

- [ ] **Step 2: Edit block.ts — relax quizId + add subtitle**

Full file after changes:

```typescript
import { z } from 'zod'
import { DifficultyLevelSchema } from './question.js'

export const BlockDTOSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  difficulty: DifficultyLevelSchema,
  topicCount: z.number().int(),
  topics: z.array(z.string()),
  quizId: z.number().int().positive().nullable(),
  gridRow: z.number().int(),
  gridCol: z.number().int(),
  color: z.string(),
})
export type BlockDTO = z.infer<typeof BlockDTOSchema>
```

- [ ] **Step 3: Edit progress.ts — relax quizId**

Full file after changes:

```typescript
import { z } from 'zod'

export const SaveProgressSchema = z.object({
  sessionId: z.string().uuid(),
  blockId: z.string(),
  quizId: z.number().int().positive().nullable(),
  score: z.number().int().min(0),
  total: z.number().int().min(1),
})
export type SaveProgressInput = z.infer<typeof SaveProgressSchema>

export const ProgressEntryDTOSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  blockId: z.string(),
  quizId: z.number().int().positive().nullable(),
  score: z.number().int(),
  total: z.number().int(),
  pct: z.number().int(),
  completedAt: z.string().datetime(),
})
export type ProgressEntryDTO = z.infer<typeof ProgressEntryDTOSchema>

export const SessionProgressDTOSchema = z.object({
  sessionId: z.string(),
  byBlock: z.record(z.string(), ProgressEntryDTOSchema),
})
export type SessionProgressDTO = z.infer<typeof SessionProgressDTOSchema>
```

- [ ] **Step 4: Build shared package to verify no errors**

```bash
cd /Users/ivanm3/code_projects/golang_test/quiz
pnpm --filter @quiz/shared build
```

Expected: build completes with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/ivanm3/code_projects/golang_test/quiz
git add packages/shared/src/schemas/question.ts packages/shared/src/schemas/block.ts packages/shared/src/schemas/progress.ts
git commit -m "refactor(shared): relax quizId from literal union to number; add subtitle to BlockDTO

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Backend entities + blockService

**Files:**
- Modify: `quiz/apps/backend/src/schemas/entities.ts`
- Modify: `quiz/apps/backend/src/services/blockService.ts`

- [ ] **Step 1: Edit entities.ts — relax quizId types + add subtitle to BlockEntity**

Full file after changes:

```typescript
import { ObjectId } from 'mongodb'
import type { DifficultyLevel } from '@quiz/shared'

// ── Questions ───────────────────────────────────────────────────────────────

interface BaseQuestionEntity {
  _id: ObjectId
  legacyId?: number
  quizId: number | null
  blockId: string | null
  difficulty: DifficultyLevel
  tags: string[]
  explanation: { ru: string; en: string }
  createdAt: Date
  updatedAt: Date
}

export interface MCQQuestionEntity extends BaseQuestionEntity {
  type: 'mcq'
  question: { ru: string; en: string }
  code?: string
  options: { ru: [string, string, string, string]; en: [string, string, string, string] }
  correct: 0 | 1 | 2 | 3
}

export type QuestionEntity = MCQQuestionEntity

// ── Blocks ───────────────────────────────────────────────────────────────────

export interface BlockEntity {
  _id: ObjectId
  blockId: string
  title: { ru: string; en: string }
  subtitle: { ru: string; en: string }
  difficulty: DifficultyLevel
  topicCount: number
  topics: { ru: string[]; en: string[] }
  quizId: number | null
  gridRow: number
  gridCol: number
  color: string
  createdAt: Date
  updatedAt: Date
}

// ── Progress ─────────────────────────────────────────────────────────────────

export interface ProgressEntity {
  _id: ObjectId
  sessionId: string
  blockId: string
  quizId: number | null
  score: number
  total: number
  completedAt: Date
}
```

- [ ] **Step 2: Edit blockService.ts — extract subtitle in toDTO**

Full file after changes:

```typescript
import { blocksCol } from '../db/collections.js'
import type { BlockEntity } from '../schemas/entities.js'
import type { BlockDTO, Lang } from '@quiz/shared'

function toDTO(entity: BlockEntity, lang: Lang = 'ru'): BlockDTO {
  return {
    id: entity.blockId,
    title: entity.title[lang],
    subtitle: entity.subtitle[lang],
    difficulty: entity.difficulty,
    topicCount: entity.topicCount,
    topics: entity.topics[lang],
    quizId: entity.quizId,
    gridRow: entity.gridRow,
    gridCol: entity.gridCol,
    color: entity.color,
  }
}

export async function getAllBlocks(lang: Lang = 'ru'): Promise<BlockDTO[]> {
  const col = await blocksCol()
  const docs = await col.find({}).sort({ gridRow: 1, gridCol: 1 }).toArray()
  return docs.map((doc) => toDTO(doc, lang))
}

export async function getBlockById(blockId: string, lang: Lang = 'ru'): Promise<BlockDTO | null> {
  const col = await blocksCol()
  const doc = await col.findOne({ blockId })
  return doc ? toDTO(doc, lang) : null
}
```

- [ ] **Step 3: Verify backend typechecks**

```bash
cd /Users/ivanm3/code_projects/golang_test/quiz
pnpm --filter @quiz/backend typecheck
```

Expected: no errors. If `typecheck` script doesn't exist, run:
```bash
cd /Users/ivanm3/code_projects/golang_test/quiz/apps/backend
pnpm exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd /Users/ivanm3/code_projects/golang_test/quiz
git add apps/backend/src/schemas/entities.ts apps/backend/src/services/blockService.ts
git commit -m "refactor(backend): relax quizId to number; add subtitle to BlockEntity and toDTO

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Add subtitle to seed.ts + relax quizId types

**Files:**
- Modify: `quiz/apps/backend/scripts/seed.ts`

- [ ] **Step 1: Add subtitle + i18n title/topics to every block in the BLOCKS array**

Replace the `BLOCKS` array (lines 35–153) and `buildQuestionDoc` function. The key changes:
1. Each block gets `subtitle: { ru, en }`, `title: { ru, en }` (i18n), `topics: { ru, en }` (i18n)
2. `buildQuestionDoc` param `quizId: number` (remove literal union)
3. `batches` type uses `quizId: number`

Replace the entire `BLOCKS` constant and the `buildQuestionDoc` function with:

```typescript
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
```

Also replace `buildQuestionDoc` signature and `batches` type:

```typescript
function buildQuestionDoc(
  q: LegacyQuestion,
  quizId: number,
  index: number,
  total: number,
) {
  // ... rest unchanged
}
```

And in `main()`, replace the `batches` type annotation:

```typescript
const batches: Array<{ quizId: number; qs: LegacyQuestion[] }> = [
  { quizId: 1, qs: questions as LegacyQuestion[] },
  { quizId: 2, qs: questions2 as LegacyQuestion[] },
  { quizId: 3, qs: questions3 as LegacyQuestion[] },
  { quizId: 4, qs: questionsOop as LegacyQuestion[] },
  { quizId: 5, qs: questionsSql as LegacyQuestion[] },
  { quizId: 6, qs: questionsNetworks as LegacyQuestion[] },
]
```

- [ ] **Step 2: Verify seed.ts typechecks (no runtime — just tsc)**

```bash
cd /Users/ivanm3/code_projects/golang_test/quiz/apps/backend
pnpm exec tsc --noEmit --project tsconfig.seed.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/ivanm3/code_projects/golang_test/quiz
git add apps/backend/scripts/seed.ts
git commit -m "refactor(seed): add i18n subtitle/title/topics to blocks; relax quizId types

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Frontend type changes (data/blocks.ts + api/client.ts)

**Files:**
- Modify: `quiz/apps/frontend/src/data/blocks.ts`
- Modify: `quiz/apps/frontend/src/api/client.ts`

- [ ] **Step 1: Edit data/blocks.ts — add subtitle, relax quizId**

Full file after changes:

```typescript
export type DifficultyLevel =
  | "basic"
  | "basic-intermediate"
  | "intermediate"
  | "intermediate-advanced"
  | "advanced";

export interface RoadmapBlock {
  id: string;
  title: string;
  subtitle: string;
  difficulty: DifficultyLevel;
  topicCount: number;
  topics: string[];
  quizId?: number;
  gridRow: number;
  gridCol: number;
  color: string;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export const GRAPH_EDGES: GraphEdge[] = [
  { from: "primitives", to: "oop" },
  { from: "primitives", to: "sql" },
  { from: "oop", to: "concurrency" },
  { from: "sql", to: "networks" },
  { from: "concurrency", to: "server" },
  { from: "networks", to: "server" },
  { from: "server", to: "sysdesign" },
];

export const QUIZ_TO_BLOCK: Record<number, string> = {
  3: "concurrency",
};
```

- [ ] **Step 2: Edit api/client.ts — relax quizId in fetchQuestions params**

Change the `fetchQuestions` function signature only (one line):

```typescript
export async function fetchQuestions(params: {
  quizId?: number
  blockId?: string
  shuffle?: boolean
  limit?: number
}): Promise<QuestionDTO[]> {
```

- [ ] **Step 3: Commit**

```bash
cd /Users/ivanm3/code_projects/golang_test/quiz
git add apps/frontend/src/data/blocks.ts apps/frontend/src/api/client.ts
git commit -m "refactor(frontend): quizId -> number in RoadmapBlock and fetchQuestions; add subtitle field

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: App.tsx — unify quiz title flow

**Files:**
- Modify: `quiz/apps/frontend/src/App.tsx`

The key change: `startQuiz` now accepts a `title` parameter so we don't need `t("quizCard.N.title")` for the quiz screen title. Both `startQuiz` and `startBlockQuiz` set `quizTitle`, so the quiz screen always uses `quizTitle` without a conditional.

- [ ] **Step 1: Edit App.tsx**

Full file after changes:

```tsx
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Home } from "./Home";
import { Quiz } from "./Quiz";
import { BlockDetail } from "./BlockDetail";
import { LanguageSwitcher } from "./LanguageSwitcher";
import type { Question } from "./data/questions";
import { saveBlockProgress } from "./data/progress";
import { saveProgress, fetchQuestions, fetchBlocks } from "./api/client";
import { getSessionId } from "./api/session";
import { QUIZ_TO_BLOCK } from "./data/blocks";
import type { QuestionDTO, BlockDTO } from "@quiz/shared";

type Screen = "home" | "quiz" | "block";

function dtoToQuestion(dto: QuestionDTO): Question {
  return {
    id: typeof dto.id === "string" ? parseInt(dto.id, 10) || 0 : (dto.id as number),
    question: dto.question,
    code: dto.code,
    options: dto.options,
    correct: dto.correct,
    explanation: dto.explanation,
  };
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const [activeQuizId, setActiveQuizId] = useState<number | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [quizTitle, setQuizTitle] = useState<string>("");
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);

  const [blockQuizMap, setBlockQuizMap] = useState<Record<number, string>>(QUIZ_TO_BLOCK);

  useEffect(() => {
    fetchBlocks()
      .then((dtos: BlockDTO[]) => {
        const map: Record<number, string> = { ...QUIZ_TO_BLOCK };
        for (const b of dtos) {
          if (b.quizId != null) map[b.quizId] = b.id;
        }
        setBlockQuizMap(map);
      })
      .catch((err) => console.warn("[App] Failed to fetch blocks for quiz mapping:", err));
  }, [i18n.language]);

  const goHome = useCallback(() => {
    setScreen("home");
    setActiveQuizId(null);
    setActiveBlockId(null);
    setQuizTitle("");
    setQuizQuestions([]);
  }, []);

  const openBlock = useCallback((blockId: string) => {
    setSelectedBlockId(blockId);
    setScreen("block");
  }, []);

  const startQuiz = useCallback((quizId: number, title: string) => {
    setActiveQuizId(quizId);
    setQuizTitle(title);
    setQuizLoading(true);
    setScreen("quiz");

    fetchQuestions({ quizId })
      .then((dtos) => setQuizQuestions(dtos.map(dtoToQuestion)))
      .catch((err) => {
        console.error("[App] Failed to fetch questions for quiz", quizId, err);
        setQuizQuestions([]);
      })
      .finally(() => setQuizLoading(false));
  }, []);

  const startBlockQuiz = useCallback((blockId: string, title: string) => {
    setActiveBlockId(blockId);
    setActiveQuizId(null);
    setQuizTitle(title);
    setQuizLoading(true);
    setScreen("quiz");

    fetchQuestions({ blockId })
      .then((dtos) => setQuizQuestions(dtos.map(dtoToQuestion)))
      .catch((err) => {
        console.error("[App] Failed to fetch questions for block", blockId, err);
        setQuizQuestions([]);
      })
      .finally(() => setQuizLoading(false));
  }, []);

  const handleQuizComplete = useCallback(
    (quizId: number, score: number, total: number) => {
      const blockId = blockQuizMap[quizId] ?? null;

      if (blockId) {
        saveBlockProgress({ blockId, score, total, completedAt: new Date().toISOString() });
      }

      saveProgress({
        sessionId: getSessionId(),
        blockId: blockId ?? `quiz${quizId}`,
        quizId,
        score,
        total,
      }).catch((err) => console.warn("[progress] Failed to sync to backend:", err));
    },
    [blockQuizMap],
  );

  if (screen === "quiz" && (activeQuizId || activeBlockId)) {
    if (quizLoading) {
      return (
        <div className="max-w-[720px] mx-auto px-4 pb-10 pt-5 min-h-screen flex flex-col animate-fade-slide-up" style={{ textAlign: "center", paddingTop: 80 }}>
          <LanguageSwitcher />
          <p style={{ color: "#78788A" }}>{t("quiz.loading", "Loading...")}</p>
        </div>
      );
    }

    if (quizQuestions.length === 0) {
      return (
        <div className="max-w-[720px] mx-auto px-4 pb-10 pt-5 min-h-screen flex flex-col animate-fade-slide-up" style={{ textAlign: "center", paddingTop: 80 }}>
          <LanguageSwitcher />
          <p style={{ color: "#78788A" }}>{t("quiz.noQuestions", "No questions available.")}</p>
          <button className="py-3.5 px-8 bg-white/4 text-carbon-100 text-base font-semibold font-sans border border-white/6 rounded-xl cursor-pointer transition-all duration-200 hover:bg-white/7 hover:border-white/12 hover:-translate-y-px" onClick={goHome} style={{ marginTop: 16 }}>
            {t("quiz.home")}
          </button>
        </div>
      );
    }

    return (
      <>
        <LanguageSwitcher />
        <Quiz
          title={quizTitle}
          questions={quizQuestions}
          onHome={goHome}
          onComplete={(s, total) => {
            if (activeQuizId) {
              handleQuizComplete(activeQuizId, s, total);
            } else if (activeBlockId) {
              saveBlockProgress({ blockId: activeBlockId, score: s, total, completedAt: new Date().toISOString() });
              saveProgress({ sessionId: getSessionId(), blockId: activeBlockId, quizId: null as any, score: s, total })
                .catch((err) => console.warn("[progress] Failed to sync:", err));
            }
          }}
        />
      </>
    );
  }

  if (screen === "block" && selectedBlockId) {
    return (
      <>
        <LanguageSwitcher />
        <BlockDetail
          blockId={selectedBlockId}
          onHome={goHome}
          onStartQuiz={startQuiz}
          onStartBlockQuiz={startBlockQuiz}
        />
      </>
    );
  }

  return <Home onOpenBlock={openBlock} onStartQuiz={startQuiz} />;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/ivanm3/code_projects/golang_test/quiz
git add apps/frontend/src/App.tsx
git commit -m "refactor(App): startQuiz accepts title; activeQuizId: number|null

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Home.tsx — render quiz cards from block API data

**Files:**
- Modify: `quiz/apps/frontend/src/Home.tsx`

Remove all `t("quizCard.N.*")` calls. Use `b.title`, `b.subtitle`, `b.topics` from `BlockDTO` directly. The `quizCards` array is now just `blocks` filtered by `quizId != null`.

- [ ] **Step 1: Edit Home.tsx**

Full file after changes:

```tsx
import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { RoadmapGraph } from "./RoadmapGraph";
import { GRAPH_EDGES } from "./data/blocks";
import type { RoadmapBlock } from "./data/blocks";
import { loadProgress } from "./data/progress";
import { fetchBlocks } from "./api/client";
import type { BlockDTO } from "@quiz/shared";

function blockDtoToRoadmapBlock(dto: BlockDTO): RoadmapBlock {
  return {
    id: dto.id,
    title: dto.title,
    subtitle: dto.subtitle,
    difficulty: dto.difficulty,
    topicCount: dto.topicCount,
    topics: dto.topics,
    quizId: dto.quizId ?? undefined,
    gridRow: dto.gridRow,
    gridCol: dto.gridCol,
    color: dto.color,
  };
}

interface HomeProps {
  onOpenBlock: (blockId: string) => void;
  onStartQuiz: (quizId: number, title: string) => void;
}

export function Home({ onOpenBlock, onStartQuiz }: HomeProps) {
  const { t, i18n } = useTranslation();
  const progress = useMemo(() => loadProgress(), []);

  const [blocks, setBlocks] = useState<RoadmapBlock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchBlocks()
      .then((dtos) => {
        if (!cancelled) setBlocks(dtos.map(blockDtoToRoadmapBlock));
      })
      .catch((err) => console.error("[Home] Failed to fetch blocks:", err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [i18n.language]);

  const quizCards = useMemo(
    () => blocks.filter((b): b is RoadmapBlock & { quizId: number } => b.quizId != null),
    [blocks],
  );

  if (loading) {
    return (
      <div className="max-w-[1100px] mx-auto px-6 pb-15 pt-10 min-h-screen flex flex-col animate-fade-slide-up" style={{ textAlign: "center", paddingTop: 80 }}>
        <LanguageSwitcher />
        <p style={{ color: "#78788A" }}>{t("home.loading", "Loading...")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 pb-15 pt-10 min-h-screen flex flex-col animate-fade-slide-up">
      <LanguageSwitcher />

      <div className="flex gap-15 items-start min-h-[500px] mb-15 max-[768px]:flex-col max-[768px]:gap-8 max-[768px]:min-h-auto max-[768px]:mb-10">
        <div className="flex-[0_0_380px] pt-15 max-[768px]:flex-none max-[768px]:pt-5 max-[768px]:w-full">
          <div className="text-left mb-0 animate-fade-slide-up [animation-delay:0.05s] max-[768px]:text-center">
            <div className="inline-block text-[28px] font-extrabold font-sans text-carbon-950 bg-teal-400 rounded-[10px] px-[22px] py-2 mb-[18px] tracking-[-1px] transition-all duration-200 hover:scale-105 hover:shadow-[0_4px_20px_rgba(45,212,191,0.25)]">Go</div>
            <h1 className="text-4xl font-extrabold text-carbon-100 tracking-[-0.8px] mb-3.5 leading-[1.15] max-[480px]:text-2xl">{t("home.title", "Go Interview Prep")}</h1>
            <p className="text-[15px] text-carbon-300 leading-relaxed max-w-[340px] max-[768px]:max-w-none">{t("home.tagline")}</p>
          </div>
        </div>

        <div className="flex-1 flex justify-center max-[768px]:w-full">
          <section className="mb-0 animate-fade-slide-up [animation-delay:0.1s]">
            <div className="font-mono text-[11px] font-bold text-carbon-400 uppercase tracking-[1.2px] mb-5 flex items-center gap-3.5 after:content-[''] after:flex-1 after:h-px after:bg-white/4">{t("home.roadmap")}</div>
            <RoadmapGraph
              blocks={blocks}
              edges={GRAPH_EDGES}
              progress={progress}
              onOpenBlock={onOpenBlock}
            />
          </section>
        </div>
      </div>

      <section className="mb-13 animate-fade-slide-up [animation-delay:0.2s]">
        <div className="font-mono text-[11px] font-bold text-carbon-400 uppercase tracking-[1.2px] mb-5 flex items-center gap-3.5 after:content-[''] after:flex-1 after:h-px after:bg-white/4">{t("home.quizzes")}</div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[18px] max-[768px]:grid-cols-1">
          {quizCards.map((q) => (
            <button
              key={q.quizId}
              className="group flex flex-col gap-2.5 w-full bg-carbon-750 border border-white/5 rounded-[14px] p-[0_24px_22px] text-left cursor-pointer relative overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02),0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[3px] hover:border-white/8 hover:shadow-[0_4px_12px_rgba(0,0,0,0.4),0_12px_28px_rgba(0,0,0,0.3)] before:content-[''] before:block before:h-0.5 before:bg-[linear-gradient(90deg,var(--card-color,#2DD4BF),transparent_70%)] before:mx-[-24px] before:mb-[18px] before:opacity-60 hover:before:opacity-100 max-[480px]:p-[0_18px_18px]"
              onClick={() => onStartQuiz(q.quizId, q.title)}
              style={{ "--card-color": q.color } as React.CSSProperties}
            >
              <div className="flex justify-between items-center">
                <div className="text-[13px] font-bold font-mono tracking-[0.5px]" style={{ color: q.color }}>
                  #{q.quizId}
                </div>
                <div className="text-xs font-mono text-carbon-300 bg-white/4 px-3 py-1 rounded-full">{q.topicCount} {t("home.questions")}</div>
              </div>
              <div className="text-xl font-bold text-carbon-100 tracking-[-0.3px] max-[480px]:text-lg">{q.title}</div>
              <div className="text-[13px] text-carbon-300 leading-normal">{q.subtitle}</div>
              <div className="flex flex-wrap gap-[7px] mt-1.5">
                {q.topics.map((topic) => (
                  <span key={topic} className="text-xs font-sans text-carbon-300 bg-white/4 border-none rounded-full px-[11px] py-1 transition-all duration-200 hover:bg-teal-400/8 hover:text-teal-400">{topic}</span>
                ))}
              </div>
              <div className="text-sm font-semibold mt-1.5 tracking-[0.3px] transition-[letter-spacing] duration-200 group-hover:tracking-[1px]" style={{ color: q.color }}>
                {t("home.start")}
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/ivanm3/code_projects/golang_test/quiz
git add apps/frontend/src/Home.tsx
git commit -m "refactor(Home): quiz cards use BlockDTO data; remove quizCard.N.* i18n dependency

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: BlockDetail.tsx — pass title to onStartQuiz

**Files:**
- Modify: `quiz/apps/frontend/src/BlockDetail.tsx`

One prop type change + one call site change.

- [ ] **Step 1: Edit BlockDetail.tsx — update prop type and call site**

Change the interface:

```tsx
interface BlockDetailProps {
  blockId: string;
  onHome: () => void;
  onStartQuiz: (quizId: number, title: string) => void;
  onStartBlockQuiz?: (blockId: string, title: string) => void;
}
```

Change the button `onClick` where `block.quizId` is used (line 115 in original):

```tsx
onClick={() => onStartQuiz(block.quizId!, block.title)}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/ivanm3/code_projects/golang_test/quiz
git add apps/frontend/src/BlockDetail.tsx
git commit -m "refactor(BlockDetail): onStartQuiz(quizId: number, title: string)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Remove quizCard.* from i18n JSON files

**Files:**
- Modify: `quiz/apps/frontend/src/locales/ru.json`
- Modify: `quiz/apps/frontend/src/locales/en.json`

- [ ] **Step 1: Edit ru.json — remove quizCard section**

Full file after changes:

```json
{
  "home.tagline": "Дорожная карта подготовки к собеседованию",
  "home.roadmap": "Дорожная карта",
  "home.quizzes": "Практика — квизы",
  "home.start": "Начать →",
  "home.questions": "вопросов",

  "quiz.correct": "Верно!",
  "quiz.wrong": "Неверно!",
  "quiz.next": "Далее →",
  "quiz.results": "Результаты",
  "quiz.back": "← Back",
  "quiz.tryAgain": "Try Again",
  "quiz.home": "Home",
  "quiz.percentCorrect": "{{pct}}% correct",
  "quiz.gradeExcellent": "Senior-ready!",
  "quiz.gradeGood": "Strong Middle",
  "quiz.gradeOk": "Middle",
  "quiz.gradeWeak": "Keep studying!",

  "block.back": "← Назад",
  "block.notFound": "Блок не найден.",
  "block.questions": "вопросов",
  "block.bestScore": "Лучший результат:",
  "block.topics": "Темы",
  "block.comingSoon": "Вопросы для этого блока готовятся. Скоро здесь будет полноценный квиз на ~{{count}} вопросов.",
  "block.startQuiz": "Пройти квиз →",
  "block.inDevelopment": "Квиз в разработке",

  "roadmap.questions": "вопросов",
  "roadmap.quizAvailable": "● Квиз доступен",

  "difficulty.basic": "Базовый",
  "difficulty.basic-intermediate": "Базовый+",
  "difficulty.intermediate": "Средний",
  "difficulty.intermediate-advanced": "Средний+",
  "difficulty.advanced": "Продвинутый",

  "lang.switch": "EN"
}
```

- [ ] **Step 2: Edit en.json — remove quizCard section**

Full file after changes:

```json
{
  "home.tagline": "Interview preparation roadmap",
  "home.roadmap": "Roadmap",
  "home.quizzes": "Practice — Quizzes",
  "home.start": "Start →",
  "home.questions": "questions",

  "quiz.correct": "Correct!",
  "quiz.wrong": "Wrong!",
  "quiz.next": "Next →",
  "quiz.results": "Results",
  "quiz.back": "← Back",
  "quiz.tryAgain": "Try Again",
  "quiz.home": "Home",
  "quiz.percentCorrect": "{{pct}}% correct",
  "quiz.gradeExcellent": "Senior-ready!",
  "quiz.gradeGood": "Strong Middle",
  "quiz.gradeOk": "Middle",
  "quiz.gradeWeak": "Keep studying!",

  "block.back": "← Back",
  "block.notFound": "Block not found.",
  "block.questions": "questions",
  "block.bestScore": "Best score:",
  "block.topics": "Topics",
  "block.comingSoon": "Questions for this block are being prepared. A full quiz of ~{{count}} questions will appear here soon.",
  "block.startQuiz": "Start quiz →",
  "block.inDevelopment": "Quiz in development",

  "roadmap.questions": "questions",
  "roadmap.quizAvailable": "● Quiz available",

  "difficulty.basic": "Basic",
  "difficulty.basic-intermediate": "Basic+",
  "difficulty.intermediate": "Intermediate",
  "difficulty.intermediate-advanced": "Intermediate+",
  "difficulty.advanced": "Advanced",

  "lang.switch": "RU"
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/ivanm3/code_projects/golang_test/quiz
git add apps/frontend/src/locales/ru.json apps/frontend/src/locales/en.json
git commit -m "refactor(i18n): remove quizCard.* keys — data now served from API

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Full build check + re-seed

- [ ] **Step 1: Build the full monorepo**

```bash
cd /Users/ivanm3/code_projects/golang_test/quiz
pnpm build
```

Expected: shared → backend → frontend all build without TypeScript errors.

If there are type errors, read the output carefully — they will point to exact file:line. Fix the mismatch (likely a prop type inconsistency in a component not covered above).

- [ ] **Step 2: Re-seed local MongoDB**

```bash
cd /Users/ivanm3/code_projects/golang_test/quiz/apps/backend
DOTENV_CONFIG_PATH=../../.env.local pnpm exec tsx --tsconfig tsconfig.seed.json scripts/seed.ts
DOTENV_CONFIG_PATH=../../.env.local pnpm exec tsx --tsconfig tsconfig.seed.json scripts/migrate-i18n.ts
```

Expected output from seed.ts: `7 blocks upserted`, questions processed, indexes created.

- [ ] **Step 3: Smoke test locally**

```bash
cd /Users/ivanm3/code_projects/golang_test/quiz
pnpm dev
```

Open http://localhost:5173. Verify:
- Quiz cards on home page show correct title, subtitle, and topic chips
- Switch language (RU↔EN) — titles and subtitles change
- Clicking a quiz card opens the quiz with the correct title in the header
- Roadmap blocks load and click through to BlockDetail
- BlockDetail "Пройти квиз →" button works

- [ ] **Step 4: Commit**

No new files — just verify. If any fixes were needed in Step 1, commit them here.

---

## Task 10: Update CLAUDE.md

**Files:**
- Modify: `quiz/CLAUDE.md`

- [ ] **Step 1: Replace the "Adding a new quizId" section**

Find and replace the section:

```markdown
### Adding a new quizId
Requires updating ALL of these files:
...
```

Replace with:

```markdown
### Adding a new quiz
Adding a quiz is a data-only operation — no code changes required:

1. Add a block definition to `BLOCKS` in `apps/backend/scripts/seed.ts` with `quizId: N`, `subtitle: { ru, en }`, `title: { ru, en }`, `topics: { ru, en }`
2. Add questions import and batch entry in the same file
3. Run seed + migrate-i18n (see Seed + i18n migration section above)

The frontend derives all display data (title, subtitle, topics) from the API.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/ivanm3/code_projects/golang_test/quiz
git add CLAUDE.md
git commit -m "docs(CLAUDE.md): update quiz addition instructions — data-only operation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] quizId relaxed to `number` in all 3 shared schemas ✓ Task 1
- [x] subtitle added to BlockDTOSchema ✓ Task 1
- [x] Backend BlockEntity has subtitle + quizId: number|null ✓ Task 2
- [x] blockService.toDTO extracts subtitle ✓ Task 2
- [x] seed.ts has i18n subtitle/title/topics for all blocks ✓ Task 3
- [x] Frontend RoadmapBlock has subtitle + quizId: number ✓ Task 4
- [x] api/client.ts quizId: number ✓ Task 4
- [x] App.tsx startQuiz(quizId, title) ✓ Task 5
- [x] Home.tsx quiz cards from block data ✓ Task 6
- [x] BlockDetail.tsx onStartQuiz(quizId, title) ✓ Task 7
- [x] quizCard.* removed from both JSON files ✓ Task 8
- [x] CLAUDE.md updated ✓ Task 10

**Type consistency:**
- `onStartQuiz: (quizId: number, title: string) => void` used consistently in App (definition), Home (prop), BlockDetail (prop) ✓
- `RoadmapBlock.quizId?: number` matches `BlockDTO.quizId: number | null` mapping ✓
- `subtitle: string` in BlockDTO matches `entity.subtitle[lang]` in toDTO ✓
