---
name: add-quiz
description: Чеклист для добавления нового квиза. Обновляет 10+ файлов.
---

Добавление нового квиза с ID = $1, blockId = $2. Следуй чеклисту строго.

## 1. Создать файл вопросов

`quiz/apps/frontend/src/data/questions-{blockId}.ts`

```typescript
import type { Question } from "./questions";

export const questions{BlockId}: Question[] = [
  {
    id: 1,
    question: "...",
    code: "...",  // опционально
    options: ["A", "B", "C", "D"],
    correct: 0,  // 0-3
    explanation: "..."
  },
  // ... 50 вопросов
];
```

## 2. Обновить Zod-схемы (packages/shared/)

Добавить `z.literal({quizId})` в union во ВСЕХ трёх файлах:
- [ ] `src/schemas/question.ts` (3 места)
- [ ] `src/schemas/block.ts` (1 место)
- [ ] `src/schemas/progress.ts` (2 места)

## 3. Обновить frontend типы

Добавить `| {quizId}` к типу quizId в:
- [ ] `src/data/blocks.ts`
- [ ] `src/App.tsx`
- [ ] `src/Home.tsx`
- [ ] `src/BlockDetail.tsx`
- [ ] `src/api/client.ts`

## 4. Обновить переводы

- [ ] `src/locales/ru.json` — добавить `quizCard.{quizId}.title/subtitle/topics`
- [ ] `src/locales/en.json` — то же на английском

## 5. Обновить seed.ts

- [ ] Импортировать файл вопросов
- [ ] Добавить в `QUIZ_TO_BLOCK`
- [ ] Добавить в `batches`
- [ ] Обновить блок: `quizId`, `topicCount`, `topics`
- [ ] Обновить тип `quizId` в `buildQuestionDoc` и `batches`

## 6. Собрать и засеять

```bash
cd quiz && pnpm build
cd apps/backend
pnpm exec tsx --tsconfig tsconfig.seed.json scripts/seed.ts
pnpm exec tsx --tsconfig tsconfig.seed.json scripts/migrate-i18n.ts
```

## 7. Проверить

- [ ] `pnpm build` проходит
- [ ] Блок отображается на графе с quizId
- [ ] Квиз загружает вопросы
