import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

const RunSchema = z.object({
  body: z.string().min(1).max(50_000),
  goVersion: z.string().regex(/^go1\.\d+$/).optional(),
  withVet: z.boolean().optional(),
})

// Simple in-memory rate limiter: 20 req/min per IP (per-instance on serverless)
const hits = new Map<string, { count: number; resetAt: number }>()
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of hits) {
    if (now > entry.resetAt) hits.delete(ip)
  }
}, 5 * 60_000)

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = hits.get(ip)
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 })
    return false
  }
  entry.count++
  return entry.count > 20
}

export const playgroundRouter = new Hono()

playgroundRouter.post('/run', zValidator('json', RunSchema), async (c) => {
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    'unknown'

  if (isRateLimited(ip)) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded. Try again in a minute.' } }, 429)
  }

  const { body, goVersion, withVet } = c.req.valid('json')

  const params = new URLSearchParams()
  params.set('version', '2')
  params.set('body', body)
  if (withVet) params.set('withVet', 'true')
  if (goVersion) params.set('goVersion', goVersion)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const res = await fetch('https://go.dev/_/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: controller.signal,
    })
    const data = await res.json()
    return c.json(data)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return c.json({ error: { code: 'TIMEOUT', message: 'Compilation timed out (15s).' } }, 504)
    }
    return c.json({ error: { code: 'PROXY_ERROR', message: 'Failed to reach Go Playground.' } }, 502)
  } finally {
    clearTimeout(timeout)
  }
})
