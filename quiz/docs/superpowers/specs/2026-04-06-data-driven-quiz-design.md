# Data-Driven Quiz Addition

**Date:** 2026-04-06  
**Status:** Approved  
**Goal:** Adding a new quiz is purely a data operation (seed.ts only). Zero code changes required.

## Problem

Adding quiz N currently requires touching 10+ files:
- 3 shared Zod schemas (`quizId: 1|2|...|6` literal union)
- 4 frontend components/files (same union type in props)
- 2 i18n JSON files (`quizCard.N.title/subtitle/topics`)
- seed.ts (import + block definition)

Root causes:
1. `quizId` typed as a literal union — must be extended per quiz
2. Quiz card metadata (subtitle) lives only in i18n JSON, not in MongoDB
3. Title and topics duplicated between MongoDB and i18n JSON

## Approach A (chosen): Relaxed quizId + subtitle in block

### 1. MongoDB / Seed

Add `subtitle: { ru, en }` to block documents. All quiz card display data now lives in MongoDB:

```
Block: { id, title: {ru,en}, subtitle: {ru,en}, topics: {ru[],en[]}, difficulty,
         topicCount, quizId, gridRow, gridCol, color }
```

Adding a quiz = add block + questions in `seed.ts`, run seed + migrate-i18n. No code changes.

### 2. Shared Schemas (`packages/shared/src/schemas/`)

- **question.ts**: `quizId` union of literals → `z.number().int().positive().nullable()`  
  Affects: `BaseQuestionDTOSchema`, `CreateMCQQuestionSchema`, `QuestionQuerySchema`
- **block.ts**: same quizId change + add `subtitle: z.string()` to `BlockDTOSchema`
- **progress.ts**: `quizId` union of literals → `z.number().int().positive().nullable()`

### 3. Backend

- Block service `toDTO()`: extract `subtitle` for requested language
- seed.ts: add `subtitle: { ru, en }` to each block definition
- No new endpoints needed

### 4. Frontend

| File | Change |
|------|--------|
| `data/blocks.ts` | `quizId?: number` (remove literal union) |
| `App.tsx` | `activeQuizId: number\|null`, `startQuiz(quizId: number)` |
| `Home.tsx` | `onStartQuiz: (quizId: number) => void`; quiz cards use `b.subtitle` from BlockDTO directly |
| `BlockDetail.tsx` | `onStartQuiz: (quizId: number) => void` |
| `api/client.ts` | `quizId?: number` in fetchQuestions params |
| `locales/ru.json` | Remove `quizCard.*` section |
| `locales/en.json` | Remove `quizCard.*` section |

### What does NOT change

- Component architecture (Home → BlockDetail → Quiz)
- Progress format (blockId in localStorage and MongoDB)
- API endpoints and URL structure
- GRAPH_EDGES (stays hardcoded in blocks.ts — it's UI layout, not content)

## Migration

Re-seed with `seed.ts` + `migrate-i18n.ts`. Existing progress records are unaffected (blockId unchanged).

## CLAUDE.md update

Replace the "Adding a new quizId" section with: "Adding a quiz = add block + questions in seed.ts, then run seed + migrate-i18n."
