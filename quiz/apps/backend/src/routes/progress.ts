import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { SaveProgressSchema } from '@quiz/shared'
import { saveProgress, getSessionProgress, getUserProgress } from '../services/progressService.js'
import { optionalAuth, requireAuth, type AuthUser } from '../middleware/authMiddleware.js'

export const progressRouter = new Hono<{ Variables: { user?: AuthUser } }>()
  .post('/', optionalAuth, zValidator('json', SaveProgressSchema), async (c) => {
    const input = c.req.valid('json')
    const user = c.get('user')
    const entry = await saveProgress(input, user?.id)
    return c.json({ data: entry }, 201)
  })
  .get('/me', requireAuth, async (c) => {
    const user = c.get('user')!
    const progress = await getUserProgress(user.id)
    return c.json({ data: progress }, 200)
  })
  .get('/:sessionId', async (c) => {
    const sessionId = c.req.param('sessionId')
    const progress = await getSessionProgress(sessionId)
    return c.json({ data: progress }, 200)
  })
