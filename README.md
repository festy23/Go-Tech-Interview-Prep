# Go Tech Interview Prep

Platform for preparing for Go backend developer interviews. Live at **[golangtest-ten.vercel.app](https://golangtest-ten.vercel.app)**.

## What's inside

- **Quiz platform** — 150+ multiple-choice questions covering Go fundamentals, OOP, concurrency, SQL, networking, server patterns, and system design
- **7 topic blocks** — structured roadmap from basics to advanced system design
- **Progress tracking** — per-session score tracking across blocks
- **20 coding tasks** — practical interview problems with tests (Go)
- **Concurrency guide** — 16 primitives + 12 advanced patterns with runnable examples
- **Cheatsheet** — LaTeX-compiled PDF reference

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React, Vite, TypeScript |
| Backend | Hono, MongoDB, Zod |
| Database | MongoDB Atlas (via Vercel Marketplace) |
| Deploy | Vercel Serverless Functions |
| Monorepo | pnpm workspaces |

## Local development

```bash
# Start local MongoDB
cd quiz && docker compose up -d

# Install dependencies
pnpm install

# Seed the database
pnpm seed

# Run frontend + backend
pnpm dev
```

## Project structure

```
├── interview_tasks/       # 20 Go coding tasks with tests
├── concurrency_guide/     # Runnable concurrency examples
└── quiz/                  # Web platform (monorepo)
    ├── apps/frontend/     # React quiz UI
    ├── apps/backend/      # Hono API server
    ├── packages/shared/   # Zod schemas
    └── api/               # Vercel serverless entry point
```
