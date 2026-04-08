# Sub-Quiz Feature Design

**Date:** 2026-04-07  
**Status:** Approved

---

## Context

The quiz app currently has a flat structure: each topic block (primitives, oop, sql, etc.) maps 1:1 to a quiz of ~50 questions. This makes quizzes too long and undifferentiated. The goal is to split each block into sub-quizzes (~20 questions each) organized by sub-topic (e.g., "Go Primitives" → "Strings", "Maps", "Slices"). On the home page the topic appears as a single entry; clicking it reveals a sub-quiz selection screen.

---

## Approach: Sub-blocks via `parentBlockId`

Add an optional `parentBlockId` field to the existing `Block` entity. Sub-quizzes are ordinary blocks with `parentBlockId` set to their parent's `blockId`. No new schema types needed — all existing infrastructure (seed, API, progress, components) is reused.

---

## Data Model

### Schema changes

**`packages/shared/src/schemas/block.ts`**
```ts
// Add optional field to BlockDTO and BlockEntity
parentBlockId: z.string().optional()
```

No changes to `question.ts`, `progress.ts`, or quizId unions.

### Seed structure

Top-level blocks lose their `quizId` (set to `null`) when sub-blocks exist:
```ts
{ blockId: "primitives", parentBlockId: undefined, quizId: null, ... }
```

Sub-blocks are new entries with `parentBlockId` set:
```ts
{ blockId: "primitives-strings",  parentBlockId: "primitives", quizId: 8,  title: { ru: "Строки",   en: "Strings"  }, ... }
{ blockId: "primitives-maps",     parentBlockId: "primitives", quizId: 9,  title: { ru: "Мапы",     en: "Maps"     }, ... }
{ blockId: "primitives-slices",   parentBlockId: "primitives", quizId: 10, title: { ru: "Слайсы",   en: "Slices"   }, ... }
{ blockId: "primitives-pointers", parentBlockId: "primitives", quizId: 11, title: { ru: "Указатели",en: "Pointers" }, ... }
```

Each sub-block has its own `difficulty`, `color`, `topics`, `gridRow`, `gridCol` (gridRow/Col can be 0 since they won't appear on the roadmap graph directly).

### API

- `GET /api/blocks?lang=en` — returns all blocks including sub-blocks (frontend filters)
- `GET /api/blocks/:id?lang=en` — returns single block (unchanged)
- No new endpoints required

### Questions

Questions for sub-blocks use `quizId` (e.g., 8, 9, 10...) — same as current pattern. New quizId values must be added to the Zod union in:
1. `packages/shared/src/schemas/question.ts` (3 occurrences)
2. `packages/shared/src/schemas/block.ts` (1 occurrence)
3. `packages/shared/src/schemas/progress.ts` (2 occurrences)

---

## Navigation & State Machine

**`apps/frontend/src/App.tsx`**

```ts
type Screen = "home" | "subquiz-list" | "quiz"
// Remove "block" screen

interface AppState {
  screen: Screen
  selectedParentBlockId: string | null   // new — for SubQuizList
  activeQuizId: number | null
  activeBlockId: string | null
  quizTitle: string
  quizQuestions: Question[]
}
```

**Navigation flow:**
```
Home
  → click block WITH children  → screen="subquiz-list", selectedParentBlockId=blockId
  → click block WITHOUT children → screen="quiz" (direct, as now)

SubQuizList
  → click sub-quiz  → screen="quiz"
  → click back      → screen="home"

Quiz
  → complete        → screen="home"
```

**How to detect children:** at load time, build `childrenByParent: Record<string, BlockDTO[]>` from `blocks.filter(b => b.parentBlockId)`. A block is a "parent" if it has entries in this map.

---

## Components

### New: `SubQuizList.tsx`

Replaces `BlockDetail.tsx` for blocks with sub-quizzes.

```ts
interface SubQuizListProps {
  parentBlock: BlockDTO
  subBlocks: BlockDTO[]
  progress: Record<string, ProgressDTO>  // blockId → best attempt
  onSelectQuiz: (blockId: string, quizId: number, title: string) => void
  onBack: () => void
  lang: Lang
}
```

**Layout:**
```
← Назад                    [Go Примитивы]
────────────────────────────────────────
[Строки]          ✓ 18/20    →
[Мапы]            ○ не начат →
[Слайсы]          ◑ 12/20   →
────────────────────────────────────────
Общий прогресс: 1/3 подквизов пройдено
```

Each sub-block card shows: title, difficulty badge, completion status (✓/◑/○), score if attempted.

### Remove: `BlockDetail.tsx`

`BlockDetail` is no longer needed — its role (topic overview before starting quiz) is replaced by `SubQuizList`. Delete it.

### Modified: `Home.tsx`

No markup changes. Only the click handler changes:
```ts
// Before: openBlock(blockId)
// After:
if (childrenByParent[blockId]?.length > 0) {
  openSubQuizList(blockId)
} else if (block.quizId) {
  startQuiz(block.quizId, block.title)
}
```

---

## Progress Display

**For parent blocks (has children):**
- Aggregate from child blocks' progress
- `completed` = sub-blocks where `score / total >= 0.6`
- Display: `"N/M подквизов"` instead of percentage

**For leaf blocks (no children, as today):**
- Display: percentage or `score/total` as before

**No backend changes** — progress is already saved per `blockId`. Frontend aggregates from localStorage (`go_quiz_progress_v1`) when rendering home cards.

---

## Content Plan (seed data)

Each existing quiz gets split. Example breakdown:

| Parent block    | Sub-blocks (target ~20 q each)                                 |
|-----------------|----------------------------------------------------------------|
| primitives      | Strings, Maps, Slices, Pointers, Interfaces                    |
| oop             | SOLID, Design Patterns, Interfaces & Embedding, Composition    |
| concurrency     | Goroutines, Channels, sync package, Context                    |
| sql             | Queries, Transactions, Indexes, Go database/sql                |
| networks        | HTTP, TCP/IP, TLS, REST vs gRPC                                |
| server          | Hono/HTTP handlers, Middleware, Auth, Error handling           |
| sysdesign       | Scalability, Caching, Message queues, Databases                |

Existing questions are redistributed by sub-topic. New questions added to reach ~20 per sub-block.

---

## Verification

1. Run seed + migrate-i18n — all sub-blocks appear in `/api/blocks`
2. Home page shows parent blocks only (no sub-blocks visible at top level)
3. Click parent block → SubQuizList shows sub-block cards
4. Click sub-block → Quiz starts with correct questions
5. Complete quiz → progress saved → SubQuizList shows updated score
6. Home card for parent shows `"N/M подквизов пройдено"`
7. Blocks without children start quiz directly (no regression)
