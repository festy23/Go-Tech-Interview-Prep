import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { SaveProgressSchema } from '@quiz/shared'
import { saveProgress, getSessionProgress } from '../services/progressService.js'

export const progressRouter = new Hono()
  .post('/', zValidator('json', SaveProgressSchema), async (c) => {
    const input = c.req.valid('json')
    const entry = await saveProgress(input)
    return c.json({ data: entry }, 201)
  })
  .get('/:sessionId', async (c) => {
    const sessionId = c.req.param('sessionId')
    const progress = await getSessionProgress(sessionId)
    return c.json({ data: progress }, 200)
  })
