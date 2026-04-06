---
paths: quiz/apps/backend/**/*.ts
---

## Backend Rules

- **Framework**: Hono 4.x with @hono/zod-validator for request validation
- **Database**: MongoDB via native driver (not Mongoose). Collections: questions, blocks, progress
- **i18n entities**: MongoDB documents store `title: { ru: string, en: string }`, `topics: { ru: string[], en: string[] }`. The `toDTO()` functions in services extract the requested language.
- **Serverless**: `src/vercel.ts` is the Vercel Functions entry. `tsup.serverless.ts` bundles it (excludes mongodb native).
- **Routes**: `src/routes/` — questions.ts, blocks.ts, progress.ts. Each uses zValidator for query/body validation.
- **Services**: `src/services/` — business logic layer between routes and MongoDB collections.
- **Error handling**: `src/middleware/errorHandler.ts` — handles Zod errors, HTTP exceptions, generic errors.
- **Seed scripts**: `scripts/seed.ts` + `scripts/migrate-i18n.ts`. ALWAYS run both when seeding.
