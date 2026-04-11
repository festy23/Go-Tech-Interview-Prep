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
