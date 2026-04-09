import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { verifyAccessToken } from '../auth/tokenService.js'

export interface AuthUser {
  id: string
  email: string | null
  name: string
}

type AuthEnv = { Variables: { user: AuthUser } }

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = getCookie(c, 'access_token')
  if (!token) {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      401,
    )
  }
  try {
    const payload = await verifyAccessToken(token)
    c.set('user', { id: payload.sub, email: payload.email, name: payload.name })
  } catch {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } },
      401,
    )
  }
  await next()
})

export const optionalAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = getCookie(c, 'access_token')
  if (token) {
    try {
      const payload = await verifyAccessToken(token)
      c.set('user', { id: payload.sub, email: payload.email, name: payload.name })
    } catch {
      // Silently ignore invalid token
    }
  }
  await next()
})
