# Telegram Bot for Go Quiz Platform — Design Spec

## Context

The Go interview prep platform (golangtest-ten.vercel.app) currently has no engagement channel outside the web UI. Users visit the site, complete quizzes, and leave — with no mechanism to bring them back or maintain a learning habit. A Telegram bot addresses this by providing daily touchpoints (reminders, question of the day) and letting users practice directly in Telegram.

## Overview

A Python Telegram bot (aiogram 3) running as a separate Docker service on a VPS. Uses long-polling mode (simplest for VPS — no HTTPS/domain setup needed for the bot itself). Communicates with the existing Hono backend via HTTP API. Users link their website accounts through Telegram Login Widget.

## Features

### 1. Smart Reminders
- Bot sends a daily reminder only if the user hasn't visited the site today
- Backend tracks `lastSeenAt` — updated on every `GET /api/auth/me` call
- Bot queries `GET /api/internal/user-activity?userId=X` to check last activity
- APScheduler runs daily at a configurable time (default: 10:00 MSK)
- Users toggle reminders via `/remind on` / `/remind off`

### 2. Progress Statistics (`/stats`)
- Bot queries `GET /api/internal/progress?userId=X` (reuses existing getUserProgress logic)
- Displays best score per block in a formatted message
- Shows overall completion percentage

### 3. Quick Quiz in Bot (`/quiz`)
- User picks a block from inline keyboard
- Bot fetches 5 random questions: `GET /api/internal/questions/random?blockId=X&limit=5&lang=ru`
- Each question shown with 4 inline buttons (A/B/C/D)
- Instant feedback after each answer (correct/wrong + correct answer)
- Final score shown after 5 questions
- Progress saved: `POST /api/internal/progress`
- State managed via aiogram FSM (backed by Redis)

### 4. Daily Question of the Day
- APScheduler sends 1 random question to all subscribed users daily
- Question from a random block, formatted with inline answer buttons
- Instant feedback on answer
- Separate from quiz — no progress tracking needed

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐
│   React Frontend    │     │   Telegram Bot (Py)  │
│   (Vercel)          │     │   aiogram 3          │
│                     │     │   Docker on VPS      │
│  + TG Login Widget  │     │                      │
└────────┬────────────┘     └───────────┬──────────┘
         │                              │
         │  HTTPS                       │  HTTPS
         ▼                              ▼
┌─────────────────────────────────────────────────┐
│              Hono Backend API                    │
│              (Vercel Serverless)                 │
│                                                  │
│  Public:                                         │
│  POST /api/telegram/link     — link TG account  │
│  GET  /api/telegram/status   — check linking    │
│                                                  │
│  Internal (API key auth):                        │
│  GET  /api/internal/user-activity               │
│  GET  /api/internal/questions/random             │
│  GET  /api/internal/progress                     │
│  POST /api/internal/progress                     │
│  GET  /api/internal/users/telegram               │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
              ┌─────────────┐
              │  MongoDB     │
              │  Atlas       │
              └─────────────┘
```

### Communication Pattern
- Bot → Backend: HTTP with `X-API-Key` header (shared secret)
- Internal endpoints are a separate Hono router with API key middleware
- No direct DB access from the bot

## Account Linking — Telegram Login Widget

### Flow
1. User is authenticated on the website (Google/GitHub/Yandex)
2. In UserMenu: "Connect Telegram" button appears
3. Click opens Telegram Login Widget (official Telegram JS widget)
4. User confirms in Telegram app
5. Widget returns auth data: `{ id, first_name, username, photo_url, auth_date, hash }`
6. Frontend sends `POST /api/telegram/link` with auth data + access token
7. Backend verifies HMAC-SHA256 signature using bot token
8. Backend saves `telegramId` on the user document
9. UI updates to show "Telegram connected" status

### Backend Changes
- `UserEntity` gains field: `telegramId: number | null` (Telegram user ID)
- `lastSeenAt: Date` field on UserEntity — updated on each `/api/auth/me` call
- New route file: `routes/telegram.ts`
- New internal route file: `routes/internal.ts`
- Telegram auth verification utility (HMAC-SHA256 with SHA256(bot_token))

### Frontend Changes
- `UserMenu.tsx`: "Connect Telegram" / "Telegram connected" button
- Load Telegram Login Widget script on demand
- `AuthContext`: expose `telegramLinked` boolean
- i18n keys for ru/en

## Bot Structure

```
services/telegram-bot/
├── Dockerfile
├── requirements.txt
├── bot/
│   ├── __init__.py
│   ├── main.py              # Entry point, dispatcher setup
│   ├── config.py            # Settings via pydantic-settings
│   ├── api_client.py        # aiohttp client to Hono backend
│   ├── handlers/
│   │   ├── __init__.py
│   │   ├── start.py         # /start command
│   │   ├── quiz.py          # /quiz — block selection → questions
│   │   ├── stats.py         # /stats — progress display
│   │   ├── remind.py        # /remind on|off
│   │   ├── daily.py         # Daily question answer handler
│   │   └── help.py          # /help
│   ├── states/
│   │   └── quiz.py          # QuizState FSM
│   ├── scheduler/
│   │   └── jobs.py          # APScheduler: reminders + daily question
│   ├── keyboards/
│   │   └── inline.py        # Inline keyboard builders
│   └── middlewares/
│       └── auth.py          # Check user is linked, inject user data
└── tests/
    └── ...
```

### Dependencies
- `aiogram==3.x` — Telegram bot framework
- `aiohttp` — async HTTP client (for API calls)
- `apscheduler==3.x` — scheduled jobs (reminders, daily question)
- `redis` — FSM storage + scheduler job store
- `pydantic-settings` — config management

## Docker Deployment

### docker-compose.yml (VPS)
```yaml
services:
  telegram-bot:
    build: ./services/telegram-bot
    env_file: .env
    depends_on: [redis]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c", "import sys; sys.exit(0)"]
      interval: 30s

  redis:
    image: redis:7-alpine
    volumes: [redis_data:/data]
    restart: unless-stopped

volumes:
  redis_data:
```

### Environment Variables
| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Token from BotFather |
| `API_BASE_URL` | Backend URL (https://golangtest-ten.vercel.app/api) |
| `API_SECRET_KEY` | Shared secret for internal endpoints |
| `REDIS_URL` | Redis connection (redis://redis:6379) |
| `DAILY_QUESTION_TIME` | Cron time for daily question (default: 10:00) |
| `REMINDER_TIME` | Cron time for smart reminders (default: 19:00) |

### CI/CD
- GitHub Actions workflow: `.github/workflows/deploy-bot.yml`
- Trigger: push to master, path filter `services/telegram-bot/**`
- Steps: SSH to VPS → git pull → docker compose build → docker compose up -d

## Backend API — New Endpoints

### Public (requires user auth token)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/telegram/link` | Link Telegram account. Body: TG Login Widget auth data |
| GET | `/api/telegram/status` | Check if current user has Telegram linked |
| DELETE | `/api/telegram/link` | Unlink Telegram account |

### Internal (requires `X-API-Key` header)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/internal/user-activity?userId=ID` | Returns `lastSeenAt` for a user |
| GET | `/api/internal/questions/random?blockId=X&limit=5&lang=ru` | Random questions for bot quiz |
| GET | `/api/internal/progress?userId=ID` | User progress (best per block) |
| POST | `/api/internal/progress` | Save quiz result from bot |
| GET | `/api/internal/users/telegram` | List all users with Telegram linked (for broadcast) |
| GET | `/api/internal/blocks` | List all quiz blocks (for bot menus) |

### Internal Auth Middleware
```typescript
const internalAuth = createMiddleware(async (c, next) => {
  const key = c.req.header('X-API-Key')
  if (key !== env.INTERNAL_API_KEY) return c.json({ error: 'Unauthorized' }, 401)
  await next()
})
```

## Database Changes

### UserEntity additions
```typescript
interface UserEntity {
  // ... existing fields
  telegramId: number | null       // Telegram user ID
  lastSeenAt: Date                // Updated on /api/auth/me
}
```

### New index
- `users` collection: `{ telegramId: 1 }` (sparse, unique)

### Bot-specific state
- Stored in Redis (FSM state, reminder preferences)
- No new MongoDB collections needed for bot state

## Testing

### Bot
- Unit tests with `aiogram`'s test utilities
- Mock API client responses
- Test FSM state transitions

### Backend
- Test Telegram auth signature verification
- Test internal endpoints with API key
- Test `lastSeenAt` tracking

### E2E Verification
1. Create Telegram bot via BotFather
2. Add Telegram Login Widget to frontend
3. Link account on site
4. Send `/quiz` in bot → verify questions load
5. Send `/stats` → verify progress shows
6. Wait for daily question → verify delivery
7. Don't visit site for a day → verify smart reminder arrives
