# Telegram Bot Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Telegram bot (Python/aiogram 3) that provides quiz reminders, progress stats, inline quizzes, and a daily question — linked to site accounts via Telegram Login Widget.

**Architecture:** Python bot service on VPS (Docker Compose, long-polling) talks to Hono backend via HTTP API with shared secret. Frontend adds Telegram Login Widget in UserMenu for account linking. Backend gets new `/api/telegram/*` and `/api/internal/*` route groups.

**Tech Stack:** Python 3.12 / aiogram 3 / APScheduler / Redis / aiohttp (bot), Hono 4 / MongoDB (backend), React 19 / Tailwind 4 (frontend)

**Spec:** `docs/superpowers/specs/2026-04-09-telegram-bot-design.md`

---

## File Structure

### Backend (modify existing)
- `quiz/apps/backend/src/schemas/entities.ts` — add `telegramId`, `lastSeenAt` to UserEntity
- `quiz/apps/backend/src/env.ts` — add `TELEGRAM_BOT_TOKEN`, `INTERNAL_API_KEY`
- `quiz/apps/backend/src/db/collections.ts` — add telegramId index
- `quiz/apps/backend/src/app.ts` — mount new route groups
- `quiz/apps/backend/src/routes/auth.ts` — update `/me` to track lastSeenAt
- `quiz/apps/backend/src/auth/authService.ts` — update `toUserDTO`, add `updateLastSeen`

### Backend (new files)
- `quiz/apps/backend/src/middleware/internalAuth.ts` — API key middleware
- `quiz/apps/backend/src/auth/telegramAuth.ts` — HMAC-SHA256 verification
- `quiz/apps/backend/src/routes/telegram.ts` — link/unlink/status endpoints
- `quiz/apps/backend/src/routes/internal.ts` — bot-facing API endpoints

### Shared (modify)
- `quiz/packages/shared/src/schemas/auth.ts` — add `telegramId` to UserDTO

### Frontend (modify)
- `quiz/apps/frontend/src/auth/UserMenu.tsx` — add Telegram connect button
- `quiz/apps/frontend/src/api/client.ts` — add telegram API functions
- `quiz/apps/frontend/src/locales/ru.json` — add telegram keys
- `quiz/apps/frontend/src/locales/en.json` — add telegram keys

### Python bot (all new)
- `services/telegram-bot/Dockerfile`
- `services/telegram-bot/requirements.txt`
- `services/telegram-bot/bot/__init__.py`
- `services/telegram-bot/bot/main.py`
- `services/telegram-bot/bot/config.py`
- `services/telegram-bot/bot/api_client.py`
- `services/telegram-bot/bot/states/quiz.py`
- `services/telegram-bot/bot/handlers/start.py`
- `services/telegram-bot/bot/handlers/quiz.py`
- `services/telegram-bot/bot/handlers/stats.py`
- `services/telegram-bot/bot/handlers/remind.py`
- `services/telegram-bot/bot/handlers/daily.py`
- `services/telegram-bot/bot/handlers/help.py`
- `services/telegram-bot/bot/scheduler/jobs.py`
- `services/telegram-bot/bot/keyboards/inline.py`
- `services/telegram-bot/tests/test_api_client.py`
- `services/telegram-bot/tests/test_quiz_handler.py`

### Infrastructure (new)
- `services/telegram-bot/docker-compose.yml`
- `.github/workflows/deploy-bot.yml`

---

## Phase 1: Backend — Schema & Environment

### Task 1: Add env vars for Telegram integration

**Files:**
- Modify: `quiz/apps/backend/src/env.ts`

- [ ] **Step 1: Add TELEGRAM_BOT_TOKEN and INTERNAL_API_KEY to env**

```typescript
// In the server object, after YANDEX_CLIENT_SECRET:
TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
INTERNAL_API_KEY: z.string().min(32).optional(),
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/ivanm3/code_projects/golang_test/quiz && pnpm --filter @quiz/backend build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add quiz/apps/backend/src/env.ts
git commit -m "feat(backend): add TELEGRAM_BOT_TOKEN and INTERNAL_API_KEY env vars"
```

---

### Task 2: Add telegramId and lastSeenAt to UserEntity

**Files:**
- Modify: `quiz/apps/backend/src/schemas/entities.ts`

- [ ] **Step 1: Add fields to UserEntity**

After `updatedAt: Date` (line 24), add:

```typescript
  telegramId: number | null
  lastSeenAt: Date | null
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/ivanm3/code_projects/golang_test/quiz && pnpm --filter @quiz/backend build`
Expected: Build fails — `findOrCreateUser` and other code creates UserEntity without new fields. Fix in next steps.

- [ ] **Step 3: Update findOrCreateUser to include new fields**

In `quiz/apps/backend/src/auth/authService.ts`, in the `newUser` object (around line 53), add after `updatedAt: now`:

```typescript
    telegramId: null,
    lastSeenAt: now,
```

- [ ] **Step 4: Verify build again**

Run: `cd /Users/ivanm3/code_projects/golang_test/quiz && pnpm --filter @quiz/backend build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add quiz/apps/backend/src/schemas/entities.ts quiz/apps/backend/src/auth/authService.ts
git commit -m "feat(backend): add telegramId and lastSeenAt fields to UserEntity"
```

---

### Task 3: Add telegramId index and update ensureIndexes

**Files:**
- Modify: `quiz/apps/backend/src/db/collections.ts`

- [ ] **Step 1: Add telegramId index**

In the `ensureIndexes()` function, inside the `Promise.all([...])` block, after the existing `uCol` indexes (after line 63), add:

```typescript
    uCol.createIndex({ telegramId: 1 }, { sparse: true, unique: true }),
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/ivanm3/code_projects/golang_test/quiz && pnpm --filter @quiz/backend build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add quiz/apps/backend/src/db/collections.ts
git commit -m "feat(backend): add sparse unique index on telegramId"
```

---

### Task 4: Add telegramId to shared UserDTO schema

**Files:**
- Modify: `quiz/packages/shared/src/schemas/auth.ts`

- [ ] **Step 1: Add telegramId to UserDTOSchema**

Replace the existing `UserDTOSchema`:

```typescript
export const UserDTOSchema = z.object({
  id: z.string(),
  email: z.string().email().nullable(),
  name: z.string(),
  avatarUrl: z.string().url().nullable(),
  providers: z.array(z.enum(['google', 'yandex', 'github'])),
  telegramId: z.number().nullable(),
})
```

- [ ] **Step 2: Build shared package**

Run: `cd /Users/ivanm3/code_projects/golang_test/quiz && pnpm --filter @quiz/shared build`
Expected: Build succeeds

- [ ] **Step 3: Update toUserDTO in authService.ts**

In `quiz/apps/backend/src/auth/authService.ts`, update the `toUserDTO` function:

```typescript
export function toUserDTO(user: UserEntity): UserDTO {
  return {
    id: user._id.toHexString(),
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    providers: user.providers.map((p) => p.provider),
    telegramId: user.telegramId,
  }
}
```

- [ ] **Step 4: Full build**

Run: `cd /Users/ivanm3/code_projects/golang_test/quiz && pnpm build`
Expected: All packages build successfully (shared → backend → frontend)

- [ ] **Step 5: Commit**

```bash
git add quiz/packages/shared/src/schemas/auth.ts quiz/apps/backend/src/auth/authService.ts
git commit -m "feat(shared): add telegramId to UserDTO schema"
```

---

## Phase 2: Backend — New Routes

### Task 5: Create internal API key middleware

**Files:**
- Create: `quiz/apps/backend/src/middleware/internalAuth.ts`

- [ ] **Step 1: Create the middleware file**

```typescript
import { createMiddleware } from 'hono/factory'
import { env } from '../env.js'

export const requireInternalKey = createMiddleware(async (c, next) => {
  const key = c.req.header('X-API-Key')
  if (!env.INTERNAL_API_KEY || key !== env.INTERNAL_API_KEY) {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } },
      401,
    )
  }
  await next()
})
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/ivanm3/code_projects/golang_test/quiz && pnpm --filter @quiz/backend build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add quiz/apps/backend/src/middleware/internalAuth.ts
git commit -m "feat(backend): add internal API key middleware"
```

---

### Task 6: Create Telegram auth verification utility

**Files:**
- Create: `quiz/apps/backend/src/auth/telegramAuth.ts`

- [ ] **Step 1: Create the verification file**

The Telegram Login Widget sends data signed with HMAC-SHA256 where the key is SHA256(bot_token).

```typescript
import { createHmac, createHash } from 'node:crypto'
import { env } from '../env.js'

export interface TelegramLoginData {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

/**
 * Verify Telegram Login Widget auth data.
 * See: https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramAuth(data: TelegramLoginData): boolean {
  if (!env.TELEGRAM_BOT_TOKEN) return false

  // Check auth_date is not too old (allow 1 hour)
  const now = Math.floor(Date.now() / 1000)
  if (now - data.auth_date > 3600) return false

  // Build data-check-string: sorted key=value pairs (excluding hash)
  const { hash, ...rest } = data
  const checkString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key as keyof typeof rest]}`)
    .join('\n')

  // Secret key = SHA256(bot_token)
  const secretKey = createHash('sha256')
    .update(env.TELEGRAM_BOT_TOKEN)
    .digest()

  // HMAC-SHA256(data_check_string, secret_key)
  const hmac = createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex')

  return hmac === hash
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/ivanm3/code_projects/golang_test/quiz && pnpm --filter @quiz/backend build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add quiz/apps/backend/src/auth/telegramAuth.ts
git commit -m "feat(backend): add Telegram Login Widget HMAC verification"
```

---

### Task 7: Create Telegram routes (link / status / unlink)

**Files:**
- Create: `quiz/apps/backend/src/routes/telegram.ts`

- [ ] **Step 1: Create the telegram router**

```typescript
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { requireAuth } from '../middleware/authMiddleware.js'
import { verifyTelegramAuth, type TelegramLoginData } from '../auth/telegramAuth.js'
import { usersCol, ObjectId } from '../db/collections.js'

const TelegramLinkSchema = z.object({
  id: z.number(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number(),
  hash: z.string(),
})

export const telegramRouter = new Hono()

  // Link Telegram account
  .post('/link', requireAuth, zValidator('json', TelegramLinkSchema), async (c) => {
    const authUser = c.get('user')
    const data = c.req.valid('json') as TelegramLoginData

    if (!verifyTelegramAuth(data)) {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Invalid Telegram auth data' } },
        403,
      )
    }

    const col = await usersCol()

    // Check if this Telegram ID is already linked to another user
    const existing = await col.findOne({ telegramId: data.id })
    if (existing && existing._id.toHexString() !== authUser.id) {
      return c.json(
        { error: { code: 'CONFLICT', message: 'Telegram account already linked to another user' } },
        409,
      )
    }

    await col.updateOne(
      { _id: new ObjectId(authUser.id) },
      { $set: { telegramId: data.id, updatedAt: new Date() } },
    )

    return c.json({ data: { linked: true, telegramId: data.id } })
  })

  // Check Telegram link status
  .get('/status', requireAuth, async (c) => {
    const authUser = c.get('user')
    const col = await usersCol()
    const user = await col.findOne({ _id: new ObjectId(authUser.id) })
    return c.json({
      data: { linked: !!user?.telegramId, telegramId: user?.telegramId ?? null },
    })
  })

  // Unlink Telegram account
  .delete('/link', requireAuth, async (c) => {
    const authUser = c.get('user')
    const col = await usersCol()
    await col.updateOne(
      { _id: new ObjectId(authUser.id) },
      { $set: { telegramId: null, updatedAt: new Date() } },
    )
    return c.json({ data: { linked: false } })
  })
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/ivanm3/code_projects/golang_test/quiz && pnpm --filter @quiz/backend build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add quiz/apps/backend/src/routes/telegram.ts
git commit -m "feat(backend): add Telegram link/status/unlink routes"
```

---

### Task 8: Create internal routes (bot-facing API)

**Files:**
- Create: `quiz/apps/backend/src/routes/internal.ts`

- [ ] **Step 1: Create the internal router**

```typescript
import { Hono } from 'hono'
import { requireInternalKey } from '../middleware/internalAuth.js'
import { usersCol, ObjectId } from '../db/collections.js'
import { getQuestions } from '../services/questionService.js'
import { getUserProgress, saveProgress } from '../services/progressService.js'
import { getBlocks } from '../services/blockService.js'
import type { Lang } from '@quiz/shared'

export const internalRouter = new Hono()

  // All internal routes require API key
  .use('*', requireInternalKey)

  // User activity (for smart reminders)
  .get('/user-activity', async (c) => {
    const userId = c.req.query('userId')
    if (!userId) {
      return c.json(
        { error: { code: 'BAD_REQUEST', message: 'userId required' } },
        400,
      )
    }

    const col = await usersCol()
    const user = await col.findOne({ _id: new ObjectId(userId) })
    if (!user) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: 'User not found' } },
        404,
      )
    }

    return c.json({
      data: {
        lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
      },
    })
  })

  // Random questions (for bot quiz)
  .get('/questions/random', async (c) => {
    const blockId = c.req.query('blockId')
    const limit = parseInt(c.req.query('limit') ?? '5', 10)
    const lang = (c.req.query('lang') ?? 'ru') as Lang

    const questions = await getQuestions({
      blockId: blockId || undefined,
      shuffle: true,
      limit,
      lang,
    })

    return c.json({ data: questions })
  })

  // User progress (for /stats command)
  .get('/progress', async (c) => {
    const userId = c.req.query('userId')
    if (!userId) {
      return c.json(
        { error: { code: 'BAD_REQUEST', message: 'userId required' } },
        400,
      )
    }

    const progress = await getUserProgress(userId)
    return c.json({ data: progress })
  })

  // Save progress from bot quiz
  .post('/progress', async (c) => {
    const body = await c.req.json()
    const result = await saveProgress(
      {
        sessionId: body.sessionId,
        blockId: body.blockId,
        quizId: body.quizId,
        score: body.score,
        total: body.total,
      },
      body.userId,
    )
    return c.json({ data: result })
  })

  // All users with Telegram linked (for broadcast)
  .get('/users/telegram', async (c) => {
    const col = await usersCol()
    const users = await col
      .find({ telegramId: { $ne: null } })
      .project({ _id: 1, telegramId: 1, name: 1, lastSeenAt: 1 })
      .toArray()

    return c.json({
      data: users.map((u) => ({
        userId: u._id.toHexString(),
        telegramId: u.telegramId,
        name: u.name,
        lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      })),
    })
  })

  // All blocks (for bot menus)
  .get('/blocks', async (c) => {
    const lang = (c.req.query('lang') ?? 'ru') as Lang
    const blocks = await getBlocks(lang)
    return c.json({ data: blocks })
  })
```

- [ ] **Step 2: Check that blockService exports getBlocks**

Read `quiz/apps/backend/src/services/blockService.ts` and verify `getBlocks` exists. If the function has a different name, update the import accordingly.

- [ ] **Step 3: Verify build**

Run: `cd /Users/ivanm3/code_projects/golang_test/quiz && pnpm --filter @quiz/backend build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add quiz/apps/backend/src/routes/internal.ts
git commit -m "feat(backend): add internal API routes for Telegram bot"
```

---

### Task 9: Update /me route to track lastSeenAt + mount new routes

**Files:**
- Modify: `quiz/apps/backend/src/routes/auth.ts`
- Modify: `quiz/apps/backend/src/app.ts`

- [ ] **Step 1: Update /me handler in auth.ts to track lastSeenAt**

In `quiz/apps/backend/src/routes/auth.ts`, update the `/me` handler (around line 140-150). Add a fire-and-forget `updateOne` after fetching the user:

Replace:
```typescript
  .get('/me', requireAuth, async (c) => {
    const authUser = c.get('user')
    const user = await getUserById(authUser.id)
    if (!user) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: 'User not found' } },
        404,
      )
    }
    return c.json({ data: toUserDTO(user) })
  })
```

With:
```typescript
  .get('/me', requireAuth, async (c) => {
    const authUser = c.get('user')
    const user = await getUserById(authUser.id)
    if (!user) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: 'User not found' } },
        404,
      )
    }
    // Track last seen for smart reminders (fire-and-forget)
    usersCol().then((col) =>
      col.updateOne(
        { _id: user._id },
        { $set: { lastSeenAt: new Date() } },
      ),
    )
    return c.json({ data: toUserDTO(user) })
  })
```

Add import at the top of auth.ts:
```typescript
import { usersCol } from '../db/collections.js'
```

- [ ] **Step 2: Mount telegram and internal routes in app.ts**

In `quiz/apps/backend/src/app.ts`, add imports:

```typescript
import { telegramRouter } from './routes/telegram.js'
import { internalRouter } from './routes/internal.js'
```

Update the route chain (after the existing `.route('/api/playground', playgroundRouter)`):

```typescript
const apiRoutes = app
  .route('/api/auth', authRouter)
  .route('/api/questions', questionsRouter)
  .route('/api/blocks', blocksRouter)
  .route('/api/progress', progressRouter)
  .route('/api/playground', playgroundRouter)
  .route('/api/telegram', telegramRouter)
  .route('/api/internal', internalRouter)
```

- [ ] **Step 3: Allow X-API-Key header in CORS**

In app.ts, update the cors config `allowHeaders`:

```typescript
allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
```

- [ ] **Step 4: Full build**

Run: `cd /Users/ivanm3/code_projects/golang_test/quiz && pnpm build`
Expected: All packages build successfully

- [ ] **Step 5: Commit**

```bash
git add quiz/apps/backend/src/routes/auth.ts quiz/apps/backend/src/app.ts
git commit -m "feat(backend): mount telegram and internal routes, track lastSeenAt on /me"
```

---

## Phase 3: Frontend — Telegram Linking UI

### Task 10: Add Telegram API functions to frontend client

**Files:**
- Modify: `quiz/apps/frontend/src/api/client.ts`

- [ ] **Step 1: Add telegram API functions**

At the end of the file, before the Playground section, add:

```typescript
// ── Telegram ────────────────────────────────────────────────────────────────

export async function linkTelegram(data: {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}): Promise<{ linked: boolean; telegramId: number }> {
  const res = await apiFetch<{ data: { linked: boolean; telegramId: number } }>(
    '/telegram/link',
    { method: 'POST', body: JSON.stringify(data) },
  )
  return res.data
}

export async function getTelegramStatus(): Promise<{
  linked: boolean
  telegramId: number | null
}> {
  const res = await apiFetch<{
    data: { linked: boolean; telegramId: number | null }
  }>('/telegram/status')
  return res.data
}

export async function unlinkTelegram(): Promise<void> {
  await apiFetch('/telegram/link', { method: 'DELETE' })
}
```

- [ ] **Step 2: Verify frontend build**

Run: `cd /Users/ivanm3/code_projects/golang_test/quiz && pnpm --filter @quiz/frontend build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add quiz/apps/frontend/src/api/client.ts
git commit -m "feat(frontend): add Telegram link/status/unlink API functions"
```

---

### Task 11: Add i18n keys for Telegram

**Files:**
- Modify: `quiz/apps/frontend/src/locales/ru.json`
- Modify: `quiz/apps/frontend/src/locales/en.json`

- [ ] **Step 1: Add Russian translations**

Add after the `"auth.github": "GitHub"` line:

```json
  "auth.connectTelegram": "Подключить Telegram",
  "auth.telegramConnected": "Telegram подключён",
  "auth.disconnectTelegram": "Отключить Telegram",
  "auth.telegramLinkError": "Не удалось подключить Telegram"
```

(Don't forget to add a comma after `"auth.github": "GitHub"`)

- [ ] **Step 2: Add English translations**

Add after the `"auth.github": "GitHub"` line:

```json
  "auth.connectTelegram": "Connect Telegram",
  "auth.telegramConnected": "Telegram connected",
  "auth.disconnectTelegram": "Disconnect Telegram",
  "auth.telegramLinkError": "Failed to connect Telegram"
```

(Don't forget to add a comma after `"auth.github": "GitHub"`)

- [ ] **Step 3: Verify frontend build**

Run: `cd /Users/ivanm3/code_projects/golang_test/quiz && pnpm --filter @quiz/frontend build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add quiz/apps/frontend/src/locales/ru.json quiz/apps/frontend/src/locales/en.json
git commit -m "feat(frontend): add Telegram i18n keys (ru/en)"
```

---

### Task 12: Add Telegram connect button to UserMenu

**Files:**
- Modify: `quiz/apps/frontend/src/auth/UserMenu.tsx`

- [ ] **Step 1: Update UserMenu with Telegram linking**

Replace the entire file with:

```typescript
import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from './AuthContext'
import { linkTelegram, unlinkTelegram, getTelegramStatus } from '../api/client'

export function UserMenu() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [telegramLinked, setTelegramLinked] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Check Telegram link status on mount
  useEffect(() => {
    if (!user) return
    getTelegramStatus()
      .then((s) => setTelegramLinked(s.linked))
      .catch(() => {})
  }, [user])

  const handleTelegramConnect = useCallback(() => {
    // Load Telegram Login Widget script dynamically
    const botName = import.meta.env.VITE_TELEGRAM_BOT_NAME
    if (!botName) return

    // Use Telegram's window callback approach
    ;(window as any).onTelegramAuth = async (tgUser: any) => {
      try {
        await linkTelegram(tgUser)
        setTelegramLinked(true)
      } catch {
        alert(t('auth.telegramLinkError'))
      }
    }

    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login', botName)
    script.setAttribute('data-size', 'medium')
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')
    script.setAttribute('data-request-access', 'write')
    script.async = true

    // Create a temporary container for the widget
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.top = '-9999px'
    container.appendChild(script)
    document.body.appendChild(container)

    // Cleanup after 60 seconds
    setTimeout(() => container.remove(), 60000)
  }, [t])

  const handleTelegramDisconnect = useCallback(async () => {
    await unlinkTelegram()
    setTelegramLinked(false)
  }, [])

  if (!user) return null

  const initials = user.name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 py-1.5 px-3 bg-white/5 border border-white/8 rounded-xl cursor-pointer transition-all duration-200 hover:bg-white/10 hover:border-white/15"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="w-7 h-7 rounded-full object-cover"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-teal-400/20 text-teal-400 flex items-center justify-center text-xs font-semibold font-mono">
            {initials}
          </div>
        )}
        <span className="text-carbon-200 text-sm font-sans hidden min-[480px]:inline">
          {user.name}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-carbon-900 border border-white/10 rounded-xl shadow-lg overflow-hidden z-50 animate-fade-slide-up">
          <div className="px-4 py-3 border-b border-white/6">
            <p className="text-carbon-100 text-sm font-semibold font-sans truncate">
              {user.name}
            </p>
            {user.email && (
              <p className="text-carbon-400 text-xs font-sans truncate mt-0.5">
                {user.email}
              </p>
            )}
          </div>
          {telegramLinked ? (
            <button
              onClick={handleTelegramDisconnect}
              className="w-full text-left px-4 py-2.5 text-emerald-400 text-sm font-sans cursor-pointer transition-colors duration-150 hover:bg-white/5 hover:text-emerald-300"
            >
              {t('auth.telegramConnected')} ✓
            </button>
          ) : (
            <button
              onClick={handleTelegramConnect}
              className="w-full text-left px-4 py-2.5 text-sky-400 text-sm font-sans cursor-pointer transition-colors duration-150 hover:bg-white/5 hover:text-sky-300"
            >
              {t('auth.connectTelegram')}
            </button>
          )}
          <button
            onClick={() => {
              setOpen(false)
              logout()
            }}
            className="w-full text-left px-4 py-2.5 text-carbon-300 text-sm font-sans cursor-pointer transition-colors duration-150 hover:bg-white/5 hover:text-carbon-100"
          >
            {t('auth.logout')}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify frontend build**

Run: `cd /Users/ivanm3/code_projects/golang_test/quiz && pnpm --filter @quiz/frontend build`
Expected: Build succeeds

- [ ] **Step 3: Manual verification**

Run: `cd /Users/ivanm3/code_projects/golang_test/quiz && pnpm dev`
Navigate to the site → login → click avatar → verify:
- "Connect Telegram" button appears in dropdown
- "Sign out" button still works

- [ ] **Step 4: Commit**

```bash
git add quiz/apps/frontend/src/auth/UserMenu.tsx
git commit -m "feat(frontend): add Telegram connect/disconnect button in UserMenu"
```

---

## Phase 4: Python Bot — Core

### Task 13: Create bot project structure and config

**Files:**
- Create: `services/telegram-bot/requirements.txt`
- Create: `services/telegram-bot/bot/__init__.py`
- Create: `services/telegram-bot/bot/config.py`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p services/telegram-bot/bot/{handlers,states,scheduler,keyboards}
mkdir -p services/telegram-bot/tests
```

- [ ] **Step 2: Create requirements.txt**

```
aiogram==3.15.0
aiohttp==3.11.0
apscheduler==3.10.4
redis==5.2.0
pydantic-settings==2.7.0
pytest==8.3.0
pytest-asyncio==0.24.0
```

- [ ] **Step 3: Create bot/__init__.py**

Empty file:
```python
```

- [ ] **Step 4: Create bot/config.py**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    telegram_bot_token: str
    api_base_url: str = "https://golangtest-ten.vercel.app/api"
    api_secret_key: str
    redis_url: str = "redis://redis:6379"
    daily_question_hour: int = 10
    daily_question_minute: int = 0
    reminder_hour: int = 19
    reminder_minute: int = 0

    model_config = {"env_file": ".env"}


settings = Settings()
```

- [ ] **Step 5: Commit**

```bash
git add services/telegram-bot/
git commit -m "feat(bot): scaffold Python project structure with config"
```

---

### Task 14: Create API client for backend communication

**Files:**
- Create: `services/telegram-bot/bot/api_client.py`
- Create: `services/telegram-bot/tests/test_api_client.py`

- [ ] **Step 1: Write the failing test**

`services/telegram-bot/tests/test_api_client.py`:

```python
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from bot.api_client import BackendClient


@pytest.fixture
def client():
    return BackendClient(
        base_url="https://example.com/api",
        api_key="test-secret-key-that-is-long-enough",
    )


@pytest.mark.asyncio
async def test_get_blocks(client: BackendClient):
    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.json = AsyncMock(
        return_value={"data": [{"blockId": "goroutines", "title": "Goroutines"}]}
    )

    with patch.object(client, "_session") as mock_session:
        mock_session.get = AsyncMock(return_value=mock_response)
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=None)
        blocks = await client.get_blocks()
        assert len(blocks) == 1
        assert blocks[0]["blockId"] == "goroutines"


@pytest.mark.asyncio
async def test_get_random_questions(client: BackendClient):
    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.json = AsyncMock(
        return_value={
            "data": [
                {
                    "id": "1",
                    "question": "What is a goroutine?",
                    "options": ["A", "B", "C", "D"],
                    "correct": 0,
                }
            ]
        }
    )

    with patch.object(client, "_session") as mock_session:
        mock_session.get = AsyncMock(return_value=mock_response)
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=None)
        questions = await client.get_random_questions(block_id="goroutines", limit=5)
        assert len(questions) == 1
        assert questions[0]["id"] == "1"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd services/telegram-bot && python -m pytest tests/test_api_client.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'bot.api_client'`

- [ ] **Step 3: Create bot/api_client.py**

```python
from __future__ import annotations

import aiohttp

from .config import settings


class BackendClient:
    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
    ):
        self._base_url = base_url or settings.api_base_url
        self._api_key = api_key or settings.api_secret_key
        self._session: aiohttp.ClientSession | None = None

    @property
    def _headers(self) -> dict[str, str]:
        return {"X-API-Key": self._api_key, "Content-Type": "application/json"}

    async def ensure_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(headers=self._headers)
        return self._session

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    async def _get(self, path: str, params: dict | None = None) -> dict:
        session = await self.ensure_session()
        async with session.get(f"{self._base_url}{path}", params=params) as resp:
            resp.raise_for_status()
            return await resp.json()

    async def _post(self, path: str, json: dict | None = None) -> dict:
        session = await self.ensure_session()
        async with session.post(f"{self._base_url}{path}", json=json) as resp:
            resp.raise_for_status()
            return await resp.json()

    # ── Public methods ────────────────────────────────────────────────────────

    async def get_blocks(self, lang: str = "ru") -> list[dict]:
        result = await self._get("/internal/blocks", params={"lang": lang})
        return result["data"]

    async def get_random_questions(
        self,
        block_id: str,
        limit: int = 5,
        lang: str = "ru",
    ) -> list[dict]:
        result = await self._get(
            "/internal/questions/random",
            params={"blockId": block_id, "limit": str(limit), "lang": lang},
        )
        return result["data"]

    async def get_user_progress(self, user_id: str) -> dict:
        result = await self._get("/internal/progress", params={"userId": user_id})
        return result["data"]

    async def save_progress(
        self,
        user_id: str,
        session_id: str,
        block_id: str,
        quiz_id: int | None,
        score: int,
        total: int,
    ) -> dict:
        result = await self._post(
            "/internal/progress",
            json={
                "userId": user_id,
                "sessionId": session_id,
                "blockId": block_id,
                "quizId": quiz_id,
                "score": score,
                "total": total,
            },
        )
        return result["data"]

    async def get_user_activity(self, user_id: str) -> str | None:
        result = await self._get(
            "/internal/user-activity",
            params={"userId": user_id},
        )
        return result["data"].get("lastSeenAt")

    async def get_telegram_users(self) -> list[dict]:
        result = await self._get("/internal/users/telegram")
        return result["data"]
```

- [ ] **Step 4: Run tests**

```bash
cd services/telegram-bot && python -m pytest tests/test_api_client.py -v
```

Expected: Tests pass (mocked session)

- [ ] **Step 5: Commit**

```bash
git add services/telegram-bot/bot/api_client.py services/telegram-bot/tests/test_api_client.py
git commit -m "feat(bot): add backend API client with tests"
```

---

### Task 15: Create inline keyboards and FSM states

**Files:**
- Create: `services/telegram-bot/bot/keyboards/inline.py`
- Create: `services/telegram-bot/bot/keyboards/__init__.py`
- Create: `services/telegram-bot/bot/states/quiz.py`
- Create: `services/telegram-bot/bot/states/__init__.py`
- Create: `services/telegram-bot/bot/handlers/__init__.py`

- [ ] **Step 1: Create empty __init__.py files**

```bash
touch services/telegram-bot/bot/keyboards/__init__.py
touch services/telegram-bot/bot/states/__init__.py
touch services/telegram-bot/bot/handlers/__init__.py
touch services/telegram-bot/bot/scheduler/__init__.py
```

- [ ] **Step 2: Create keyboards/inline.py**

```python
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton


def blocks_keyboard(blocks: list[dict]) -> InlineKeyboardMarkup:
    """Build keyboard with quiz block buttons."""
    buttons = []
    for block in blocks:
        if block.get("quizId") is not None:
            buttons.append([
                InlineKeyboardButton(
                    text=block["title"],
                    callback_data=f"quiz_block:{block['blockId']}",
                )
            ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def answer_keyboard(question_index: int, options: list[str]) -> InlineKeyboardMarkup:
    """Build keyboard with answer option buttons (A/B/C/D)."""
    labels = ["A", "B", "C", "D"]
    buttons = []
    for i, option in enumerate(options):
        text = f"{labels[i]}. {option[:40]}"  # Truncate long options
        buttons.append([
            InlineKeyboardButton(
                text=text,
                callback_data=f"answer:{question_index}:{i}",
            )
        ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def daily_answer_keyboard(options: list[str]) -> InlineKeyboardMarkup:
    """Build keyboard for daily question answers."""
    labels = ["A", "B", "C", "D"]
    buttons = []
    for i, option in enumerate(options):
        text = f"{labels[i]}. {option[:40]}"
        buttons.append([
            InlineKeyboardButton(
                text=text,
                callback_data=f"daily:{i}",
            )
        ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def remind_keyboard() -> InlineKeyboardMarkup:
    """Toggle reminder buttons."""
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="✅ Включить", callback_data="remind:on"),
            InlineKeyboardButton(text="❌ Выключить", callback_data="remind:off"),
        ]
    ])
```

- [ ] **Step 3: Create states/quiz.py**

```python
from aiogram.fsm.state import State, StatesGroup


class QuizState(StatesGroup):
    choosing_block = State()
    answering = State()
```

- [ ] **Step 4: Commit**

```bash
git add services/telegram-bot/bot/keyboards/ services/telegram-bot/bot/states/ services/telegram-bot/bot/handlers/__init__.py services/telegram-bot/bot/scheduler/__init__.py
git commit -m "feat(bot): add inline keyboards, FSM states, package init files"
```

---

## Phase 5: Python Bot — Handlers

### Task 16: Create /start and /help handlers

**Files:**
- Create: `services/telegram-bot/bot/handlers/start.py`
- Create: `services/telegram-bot/bot/handlers/help.py`

- [ ] **Step 1: Create handlers/start.py**

```python
from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message

router = Router()


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    await message.answer(
        "👋 Привет! Я бот для подготовки к Go-собеседованию.\n\n"
        "Вот что я умею:\n"
        "/quiz — Пройти мини-квиз (5 вопросов)\n"
        "/stats — Посмотреть свой прогресс\n"
        "/remind — Настроить напоминания\n"
        "/help — Список команд\n\n"
        "🌐 Сайт: golangtest-ten.vercel.app"
    )
```

- [ ] **Step 2: Create handlers/help.py**

```python
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

router = Router()


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    await message.answer(
        "📚 Команды:\n\n"
        "/quiz — Выбрать тему и пройти 5 вопросов\n"
        "/stats — Прогресс по темам\n"
        "/remind — Включить/выключить напоминания\n"
        "/help — Эта справка\n\n"
        "🌐 golangtest-ten.vercel.app"
    )
```

- [ ] **Step 3: Commit**

```bash
git add services/telegram-bot/bot/handlers/start.py services/telegram-bot/bot/handlers/help.py
git commit -m "feat(bot): add /start and /help command handlers"
```

---

### Task 17: Create /quiz handler with FSM

**Files:**
- Create: `services/telegram-bot/bot/handlers/quiz.py`

- [ ] **Step 1: Create handlers/quiz.py**

```python
import uuid

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from bot.api_client import BackendClient
from bot.keyboards.inline import answer_keyboard, blocks_keyboard
from bot.states.quiz import QuizState

router = Router()


@router.message(Command("quiz"))
async def cmd_quiz(message: Message, state: FSMContext, api: BackendClient) -> None:
    blocks = await api.get_blocks(lang="ru")
    if not blocks:
        await message.answer("Нет доступных квизов.")
        return

    await state.set_state(QuizState.choosing_block)
    await message.answer(
        "📝 Выбери тему для квиза:",
        reply_markup=blocks_keyboard(blocks),
    )


@router.callback_query(QuizState.choosing_block, F.data.startswith("quiz_block:"))
async def on_block_chosen(
    callback: CallbackQuery,
    state: FSMContext,
    api: BackendClient,
) -> None:
    block_id = callback.data.split(":", 1)[1]  # type: ignore[union-attr]
    questions = await api.get_random_questions(block_id=block_id, limit=5, lang="ru")

    if not questions:
        await callback.message.edit_text("В этом блоке пока нет вопросов.")  # type: ignore[union-attr]
        await state.clear()
        return

    await state.set_state(QuizState.answering)
    await state.update_data(
        questions=questions,
        block_id=block_id,
        current=0,
        score=0,
        session_id=str(uuid.uuid4()),
    )

    await _send_question(callback.message, questions, 0)  # type: ignore[arg-type]
    await callback.answer()


@router.callback_query(QuizState.answering, F.data.startswith("answer:"))
async def on_answer(
    callback: CallbackQuery,
    state: FSMContext,
    api: BackendClient,
) -> None:
    parts = callback.data.split(":")  # type: ignore[union-attr]
    chosen = int(parts[2])

    data = await state.get_data()
    questions = data["questions"]
    current = data["current"]
    score = data["score"]
    q = questions[current]

    is_correct = chosen == q["correct"]
    if is_correct:
        score += 1

    # Feedback
    labels = ["A", "B", "C", "D"]
    correct_label = labels[q["correct"]]
    if is_correct:
        feedback = f"✅ Верно! Ответ: {correct_label}"
    else:
        feedback = f"❌ Неверно. Правильный ответ: {correct_label}"

    if q.get("explanation"):
        feedback += f"\n\n💡 {q['explanation']}"

    next_index = current + 1
    total = len(questions)

    if next_index >= total:
        # Quiz finished
        feedback += f"\n\n🏁 Результат: {score}/{total}"

        pct = round(score / total * 100)
        if pct >= 90:
            feedback += " — Senior-ready! 🔥"
        elif pct >= 70:
            feedback += " — Strong Middle 💪"
        elif pct >= 50:
            feedback += " — Middle 👍"
        else:
            feedback += " — Подучи ещё! 📚"

        await callback.message.edit_text(feedback)  # type: ignore[union-attr]

        # Save progress
        user = callback.from_user
        # Find userId by telegramId via API — for now we skip if not linked
        # Progress saving requires userId, which we get from the telegram_users list
        await state.clear()
    else:
        await callback.message.edit_text(feedback)  # type: ignore[union-attr]
        await state.update_data(current=next_index, score=score)
        await _send_question(callback.message, questions, next_index)  # type: ignore[arg-type]

    await callback.answer()


async def _send_question(message, questions: list[dict], index: int) -> None:
    q = questions[index]
    total = len(questions)
    text = f"❓ Вопрос {index + 1}/{total}\n\n{q['question']}"
    if q.get("code"):
        text += f"\n\n```go\n{q['code']}\n```"
    await message.answer(
        text,
        reply_markup=answer_keyboard(index, q["options"]),
        parse_mode="Markdown",
    )
```

- [ ] **Step 2: Verify syntax**

```bash
cd services/telegram-bot && python -c "import ast; ast.parse(open('bot/handlers/quiz.py').read()); print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add services/telegram-bot/bot/handlers/quiz.py
git commit -m "feat(bot): add /quiz handler with FSM, inline answers, feedback"
```

---

### Task 18: Create /stats handler

**Files:**
- Create: `services/telegram-bot/bot/handlers/stats.py`

- [ ] **Step 1: Create handlers/stats.py**

```python
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from bot.api_client import BackendClient

router = Router()


@router.message(Command("stats"))
async def cmd_stats(message: Message, api: BackendClient) -> None:
    tg_users = await api.get_telegram_users()

    # Find current user by telegram ID
    tg_id = message.from_user.id  # type: ignore[union-attr]
    user_entry = next((u for u in tg_users if u["telegramId"] == tg_id), None)

    if not user_entry:
        await message.answer(
            "⚠️ Аккаунт не привязан.\n"
            "Привяжите Telegram на сайте golangtest-ten.vercel.app "
            "(Меню → Подключить Telegram)"
        )
        return

    progress = await api.get_user_progress(user_entry["userId"])
    by_block = progress.get("byBlock", {})

    if not by_block:
        await message.answer(
            "📊 У вас пока нет результатов.\n"
            "Начните с /quiz или на сайте!"
        )
        return

    lines = ["📊 Ваш прогресс:\n"]
    for block_id, entry in by_block.items():
        pct = entry.get("pct", 0)
        bar = "█" * (pct // 10) + "░" * (10 - pct // 10)
        lines.append(f"  {block_id}: {bar} {pct}% ({entry['score']}/{entry['total']})")

    total_score = sum(e["score"] for e in by_block.values())
    total_questions = sum(e["total"] for e in by_block.values())
    overall_pct = round(total_score / total_questions * 100) if total_questions else 0

    lines.append(f"\n🎯 Общий: {overall_pct}% ({total_score}/{total_questions})")
    lines.append("\n🌐 golangtest-ten.vercel.app")

    await message.answer("\n".join(lines))
```

- [ ] **Step 2: Commit**

```bash
git add services/telegram-bot/bot/handlers/stats.py
git commit -m "feat(bot): add /stats handler with progress display"
```

---

### Task 19: Create /remind handler

**Files:**
- Create: `services/telegram-bot/bot/handlers/remind.py`

- [ ] **Step 1: Create handlers/remind.py**

```python
from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from bot.keyboards.inline import remind_keyboard

router = Router()

# In-memory store for simplicity; Redis-backed in production via scheduler
# Key: telegram_user_id, Value: True/False
_reminder_prefs: dict[int, bool] = {}


def is_reminder_enabled(tg_id: int) -> bool:
    return _reminder_prefs.get(tg_id, True)  # Enabled by default


def get_all_reminder_users() -> set[int]:
    """Return set of telegram IDs with reminders enabled (or not explicitly off)."""
    return {uid for uid, enabled in _reminder_prefs.items() if enabled}


@router.message(Command("remind"))
async def cmd_remind(message: Message) -> None:
    tg_id = message.from_user.id  # type: ignore[union-attr]
    status = "включены ✅" if is_reminder_enabled(tg_id) else "выключены ❌"
    await message.answer(
        f"🔔 Напоминания сейчас {status}\n\n"
        "Бот напоминает пройти квиз, если вы не заходили на сайт сегодня.",
        reply_markup=remind_keyboard(),
    )


@router.callback_query(F.data == "remind:on")
async def remind_on(callback: CallbackQuery) -> None:
    tg_id = callback.from_user.id
    _reminder_prefs[tg_id] = True
    await callback.message.edit_text("🔔 Напоминания включены ✅")  # type: ignore[union-attr]
    await callback.answer()


@router.callback_query(F.data == "remind:off")
async def remind_off(callback: CallbackQuery) -> None:
    tg_id = callback.from_user.id
    _reminder_prefs[tg_id] = False
    await callback.message.edit_text("🔕 Напоминания выключены ❌")  # type: ignore[union-attr]
    await callback.answer()
```

- [ ] **Step 2: Commit**

```bash
git add services/telegram-bot/bot/handlers/remind.py
git commit -m "feat(bot): add /remind handler with toggle"
```

---

### Task 20: Create daily question handler

**Files:**
- Create: `services/telegram-bot/bot/handlers/daily.py`

- [ ] **Step 1: Create handlers/daily.py**

```python
from aiogram import F, Router
from aiogram.types import CallbackQuery

router = Router()

# Stores the correct answer for the current daily question per user
# Key: (tg_id, message_id), Value: correct_index
_daily_answers: dict[tuple[int, int], int] = {}


def store_daily_answer(tg_id: int, message_id: int, correct: int) -> None:
    _daily_answers[(tg_id, message_id)] = correct


@router.callback_query(F.data.startswith("daily:"))
async def on_daily_answer(callback: CallbackQuery) -> None:
    chosen = int(callback.data.split(":")[1])  # type: ignore[union-attr]
    tg_id = callback.from_user.id
    msg_id = callback.message.message_id  # type: ignore[union-attr]

    correct = _daily_answers.get((tg_id, msg_id))
    if correct is None:
        await callback.answer("Время ответа истекло")
        return

    labels = ["A", "B", "C", "D"]
    if chosen == correct:
        text = f"✅ Верно! Ответ: {labels[correct]}"
    else:
        text = f"❌ Неверно. Правильный ответ: {labels[correct]}"

    await callback.message.edit_text(  # type: ignore[union-attr]
        callback.message.text + f"\n\n{text}",  # type: ignore[union-attr]
    )

    # Cleanup
    _daily_answers.pop((tg_id, msg_id), None)
    await callback.answer()
```

- [ ] **Step 2: Commit**

```bash
git add services/telegram-bot/bot/handlers/daily.py
git commit -m "feat(bot): add daily question answer handler"
```

---

### Task 21: Create scheduler jobs (reminders + daily question)

**Files:**
- Create: `services/telegram-bot/bot/scheduler/jobs.py`

- [ ] **Step 1: Create scheduler/jobs.py**

```python
from __future__ import annotations

import logging
from datetime import datetime, timezone

from aiogram import Bot

from bot.api_client import BackendClient
from bot.handlers.daily import store_daily_answer
from bot.handlers.remind import is_reminder_enabled
from bot.keyboards.inline import daily_answer_keyboard

logger = logging.getLogger(__name__)


async def send_daily_question(bot: Bot, api: BackendClient) -> None:
    """Send one random question to all linked Telegram users."""
    try:
        tg_users = await api.get_telegram_users()
        if not tg_users:
            return

        questions = await api.get_random_questions(block_id="", limit=1, lang="ru")
        if not questions:
            return

        q = questions[0]
        text = f"🎯 Вопрос дня\n\n{q['question']}"
        if q.get("code"):
            text += f"\n\n```go\n{q['code']}\n```"

        keyboard = daily_answer_keyboard(q["options"])

        for user in tg_users:
            tg_id = user["telegramId"]
            try:
                msg = await bot.send_message(
                    chat_id=tg_id,
                    text=text,
                    reply_markup=keyboard,
                    parse_mode="Markdown",
                )
                store_daily_answer(tg_id, msg.message_id, q["correct"])
            except Exception as e:
                logger.warning("Failed to send daily question to %s: %s", tg_id, e)

    except Exception as e:
        logger.error("Daily question job failed: %s", e)


async def send_smart_reminders(bot: Bot, api: BackendClient) -> None:
    """Send reminders to users who haven't visited the site today."""
    try:
        tg_users = await api.get_telegram_users()
        if not tg_users:
            return

        today = datetime.now(timezone.utc).date()

        for user in tg_users:
            tg_id = user["telegramId"]

            # Check if reminders are enabled for this user
            if not is_reminder_enabled(tg_id):
                continue

            # Check last activity
            last_seen_str = user.get("lastSeenAt")
            if last_seen_str:
                last_seen = datetime.fromisoformat(last_seen_str.replace("Z", "+00:00"))
                if last_seen.date() >= today:
                    continue  # Already active today, skip

            try:
                await bot.send_message(
                    chat_id=tg_id,
                    text=(
                        "📢 Напоминание!\n\n"
                        "Сегодня вы ещё не практиковались. "
                        "Пройдите хотя бы один квиз — это займёт пару минут.\n\n"
                        "/quiz — Начать квиз\n"
                        "🌐 golangtest-ten.vercel.app"
                    ),
                )
            except Exception as e:
                logger.warning("Failed to send reminder to %s: %s", tg_id, e)

    except Exception as e:
        logger.error("Smart reminder job failed: %s", e)
```

- [ ] **Step 2: Commit**

```bash
git add services/telegram-bot/bot/scheduler/jobs.py
git commit -m "feat(bot): add scheduler jobs for daily question and smart reminders"
```

---

### Task 22: Create main.py entry point

**Files:**
- Create: `services/telegram-bot/bot/main.py`

- [ ] **Step 1: Create bot/main.py**

```python
import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.redis import RedisStorage
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from bot.api_client import BackendClient
from bot.config import settings
from bot.handlers import daily, help, quiz, remind, start, stats
from bot.scheduler.jobs import send_daily_question, send_smart_reminders

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def main() -> None:
    bot = Bot(
        token=settings.telegram_bot_token,
        default=DefaultBotProperties(parse_mode="HTML"),
    )
    storage = RedisStorage.from_url(settings.redis_url)
    dp = Dispatcher(storage=storage)

    # Create shared API client
    api = BackendClient()

    # Register routers
    dp.include_router(start.router)
    dp.include_router(help.router)
    dp.include_router(quiz.router)
    dp.include_router(stats.router)
    dp.include_router(remind.router)
    dp.include_router(daily.router)

    # Inject API client into handler context
    dp["api"] = api

    # Setup scheduler
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        send_daily_question,
        trigger=CronTrigger(
            hour=settings.daily_question_hour,
            minute=settings.daily_question_minute,
        ),
        kwargs={"bot": bot, "api": api},
        id="daily_question",
        replace_existing=True,
    )
    scheduler.add_job(
        send_smart_reminders,
        trigger=CronTrigger(
            hour=settings.reminder_hour,
            minute=settings.reminder_minute,
        ),
        kwargs={"bot": bot, "api": api},
        id="smart_reminders",
        replace_existing=True,
    )
    scheduler.start()

    logger.info("Bot starting (long-polling)...")

    try:
        await dp.start_polling(bot)
    finally:
        await api.close()
        scheduler.shutdown()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Verify syntax**

```bash
cd services/telegram-bot && python -c "import ast; ast.parse(open('bot/main.py').read()); print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add services/telegram-bot/bot/main.py
git commit -m "feat(bot): add main entry point with dispatcher, scheduler, routers"
```

---

## Phase 6: Docker & CI/CD

### Task 23: Create Dockerfile and docker-compose

**Files:**
- Create: `services/telegram-bot/Dockerfile`
- Create: `services/telegram-bot/docker-compose.yml`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY bot/ bot/

CMD ["python", "-m", "bot.main"]
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
services:
  telegram-bot:
    build: .
    env_file: .env
    depends_on:
      redis:
        condition: service_started
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

- [ ] **Step 3: Create .env.example**

`services/telegram-bot/.env.example`:

```env
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather
API_BASE_URL=https://golangtest-ten.vercel.app/api
API_SECRET_KEY=your-shared-secret-min-32-chars-long
REDIS_URL=redis://redis:6379
DAILY_QUESTION_HOUR=10
DAILY_QUESTION_MINUTE=0
REMINDER_HOUR=19
REMINDER_MINUTE=0
```

- [ ] **Step 4: Commit**

```bash
git add services/telegram-bot/Dockerfile services/telegram-bot/docker-compose.yml services/telegram-bot/.env.example
git commit -m "feat(bot): add Dockerfile, docker-compose, and env example"
```

---

### Task 24: Create GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy-bot.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
name: Deploy Telegram Bot

on:
  push:
    branches: [master]
    paths:
      - 'services/telegram-bot/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd ~/golang_test/services/telegram-bot
            git pull origin master
            docker compose build --no-cache
            docker compose up -d
            docker compose logs --tail 20 telegram-bot
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy-bot.yml
git commit -m "ci: add GitHub Actions workflow for Telegram bot deployment"
```

---

## Verification

### End-to-end test checklist

1. **Backend build:**
   ```bash
   cd quiz && pnpm build
   ```
   All packages build without errors.

2. **Start dev server:**
   ```bash
   cd quiz && pnpm dev
   ```
   Check `http://localhost:3001/health` returns `{"status":"ok"}`.

3. **Frontend — Telegram button visible:**
   Navigate to site → Login → Click avatar → Verify "Connect Telegram" appears in dropdown.

4. **Internal API (with API key):**
   ```bash
   curl -H "X-API-Key: YOUR_KEY" http://localhost:3001/api/internal/blocks?lang=ru
   ```
   Returns block list.

5. **Internal API (without key):**
   ```bash
   curl http://localhost:3001/api/internal/blocks
   ```
   Returns 401 Unauthorized.

6. **Bot starts:**
   ```bash
   cd services/telegram-bot
   docker compose up --build
   ```
   Logs show "Bot starting (long-polling)..." without errors.

7. **Bot commands:**
   - Send `/start` → greeting message
   - Send `/quiz` → block selection keyboard
   - Pick a block → questions with A/B/C/D buttons
   - Send `/stats` → progress or "not linked" message
   - Send `/remind` → toggle buttons

8. **Account linking:**
   - On site: click "Connect Telegram" → authorize in Telegram
   - Send `/stats` in bot → shows progress
