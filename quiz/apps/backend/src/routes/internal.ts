import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { requireInternalKey } from '../middleware/internalAuth.js'
import { getQuestions } from '../services/questionService.js'
import { getUserProgress, saveProgress } from '../services/progressService.js'
import { getAllBlocks } from '../services/blockService.js'
import { usersCol, ObjectId } from '../db/collections.js'
import type { Lang } from '@quiz/shared'

const UserIdQuerySchema = z.object({
  userId: z.string().min(1),
})

const QuestionsRandomQuerySchema = z.object({
  blockId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(5),
  lang: z.enum(['ru', 'en']).default('ru'),
})

const SaveProgressBodySchema = z.object({
  sessionId: z.string().min(1),
  blockId: z.string().min(1),
  quizId: z.number().int().min(1),
  score: z.number().int().min(0),
  total: z.number().int().min(1),
  userId: z.string().min(1).optional(),
})

const BlocksQuerySchema = z.object({
  lang: z.enum(['ru', 'en']).default('ru'),
})

export const internalRouter = new Hono()

  // ── All internal routes require API key ────────────────────────────────────
  .use('*', requireInternalKey)

  // ── GET /user-activity?userId=X ────────────────────────────────────────────
  .get('/user-activity', zValidator('query', UserIdQuerySchema), async (c) => {
    const { userId } = c.req.valid('query')
    const col = await usersCol()
    const user = await col.findOne(
      { _id: new ObjectId(userId) },
      { projection: { lastSeenAt: 1 } },
    )
    if (!user) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: 'User not found' } },
        404,
      )
    }
    return c.json({
      data: { userId, lastSeenAt: user.lastSeenAt?.toISOString() ?? null },
    })
  })

  // ── GET /questions/random?blockId=X&limit=5&lang=ru ───────────────────────
  .get('/questions/random', zValidator('query', QuestionsRandomQuerySchema), async (c) => {
    const { blockId, limit, lang } = c.req.valid('query')
    const questions = await getQuestions({
      blockId,
      limit,
      lang: lang as Lang,
      shuffle: true,
    })
    return c.json({ data: questions })
  })

  // ── GET /progress?userId=X ─────────────────────────────────────────────────
  .get('/progress', zValidator('query', UserIdQuerySchema), async (c) => {
    const { userId } = c.req.valid('query')
    const progress = await getUserProgress(userId)
    return c.json({ data: progress })
  })

  // ── POST /progress ─────────────────────────────────────────────────────────
  .post('/progress', zValidator('json', SaveProgressBodySchema), async (c) => {
    const body = c.req.valid('json')
    const { userId, ...input } = body
    const entry = await saveProgress(input, userId)
    return c.json({ data: entry })
  })

  // ── GET /users/telegram ────────────────────────────────────────────────────
  .get('/users/telegram', async (c) => {
    const col = await usersCol()
    const users = await col
      .find(
        { telegramId: { $exists: true } },
        { projection: { _id: 1, name: 1, email: 1, telegramId: 1, lastSeenAt: 1 } },
      )
      .toArray()
    return c.json({
      data: users.map((u) => ({
        id: u._id.toHexString(),
        name: u.name,
        email: u.email,
        telegramId: u.telegramId,
        lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      })),
    })
  })

  // ── GET /blocks?lang=ru ────────────────────────────────────────────────────
  .get('/blocks', zValidator('query', BlocksQuerySchema), async (c) => {
    const { lang } = c.req.valid('query')
    const blocks = await getAllBlocks(lang as Lang)
    return c.json({ data: blocks })
  })
