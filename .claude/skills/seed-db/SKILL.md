---
name: seed-db
description: Seed MongoDB + i18n migration. Use after adding or changing questions/blocks.
---

Seed базу данных и запусти i18n миграцию. Аргумент `prod` = production база.

## Шаги

1. Перейди в `quiz/apps/backend/`

2. Запусти seed:
```bash
# Локальная БД (по умолчанию):
pnpm exec tsx --tsconfig tsconfig.seed.json scripts/seed.ts

# Production (если аргумент "prod"):
DOTENV_CONFIG_PATH=../../.env.local pnpm exec tsx --tsconfig tsconfig.seed.json scripts/seed.ts
```

3. **ОБЯЗАТЕЛЬНО** запусти i18n миграцию после seed:
```bash
# Локальная:
pnpm exec tsx --tsconfig tsconfig.seed.json scripts/migrate-i18n.ts

# Production:
DOTENV_CONFIG_PATH=../../.env.local pnpm exec tsx --tsconfig tsconfig.seed.json scripts/migrate-i18n.ts
```

4. Проверь результат: `curl -s http://localhost:3001/api/blocks?lang=ru | head -c 200`

## ВАЖНО
Без шага 3 блоки НЕ загрузятся! Seed пишет `title` как строку, бэкенд ожидает `{ ru: "...", en: "..." }`.
