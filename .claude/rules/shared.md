---
paths: quiz/packages/shared/**/*.ts
---

## Shared Schemas Rules

- **Critical**: when adding a new quizId literal, update ALL THREE files:
  1. `src/schemas/question.ts` (3 union occurrences)
  2. `src/schemas/block.ts` (1 union occurrence)
  3. `src/schemas/progress.ts` (2 union occurrences)
- Also update frontend types in 5 files (see CLAUDE.md "Adding a new quizId")
- **Export**: all schemas and types are re-exported from `src/index.ts`
- **Build**: `tsup src/index.ts --format esm --dts --clean` produces ESM + .d.ts
- **Zod version**: 4.x (not 3.x). Use z.union with z.literal for quizId.
