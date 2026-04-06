# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Go interview prep platform: React quiz app (monorepo `quiz/`) + Go learning materials. Live: golangtest-ten.vercel.app

## Monorepo (quiz/)

- `apps/frontend/` — React 19 + Vite 8 + Tailwind CSS 4 + i18next
- `apps/backend/` — Hono + MongoDB + Zod
- `packages/shared/` — Zod schemas (QuestionDTO, BlockDTO)
- `api/index.js` — Vercel serverless entry

Go materials at root: `interview_tasks/` (20 tasks), `concurrency_guide/` (16 patterns).

## Commands (from quiz/)

```bash
pnpm dev          # frontend (5173) + backend (3001)
pnpm build        # shared → backend → frontend
pnpm seed         # seed MongoDB with questions
pnpm docker:up    # local MongoDB
go test ./...     # Go tests (from root)
```

## Critical Rules

### Seed + i18n migration
After EVERY `seed.ts` run, MUST run `migrate-i18n.ts`. Seed writes flat strings, backend expects `{ ru: "...", en: "..." }`. Without migration, blocks won't load (Zod fails on missing `title`).

```bash
cd quiz/apps/backend
pnpm exec tsx --tsconfig tsconfig.seed.json scripts/seed.ts
pnpm exec tsx --tsconfig tsconfig.seed.json scripts/migrate-i18n.ts
# Production: prefix with DOTENV_CONFIG_PATH=../../.env.local
```

### Adding a new quiz
Adding a quiz is a **data-only operation** — no code changes required:

1. Add a block entry to `BLOCKS` in `apps/backend/scripts/seed.ts`:
   - `blockId`, `title: { ru, en }`, `subtitle: { ru, en }`, `topics: { ru[], en[] }`
   - `quizId: N` (any positive integer not already used), `difficulty`, `gridRow`, `gridCol`, `color`
2. Add a questions import and a `{ quizId: N, qs: ... }` entry to `batches` in the same file
3. Run seed + migrate-i18n (see Seed + i18n migration section above)

The frontend derives all display data (title, subtitle, topics) from the API automatically.

## Code Style

- **CSS**: Tailwind v4 utilities inline. Important modifier: suffix `bg-red-400!` (not prefix `!bg-red-400`). Conditional classes via `clsx`.
- **Design tokens**: Carbon palette in `src/global.css` @theme (carbon-950 through carbon-100). Fonts: font-sans = Sora, font-mono = JetBrains Mono.
- **Commits**: conventional commits (feat/fix/refactor/style/ci/chore). End with `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`.
- **Language**: Questions and UI text in Russian. Code, commits, docs in English.

## Deploy

Push to `master` → GitHub Actions (`.github/workflows/deploy.yml`) → Vercel production. Secrets: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID.
