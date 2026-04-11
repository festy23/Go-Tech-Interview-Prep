import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { env } from './env.js'
import { errorHandler } from './middleware/errorHandler.js'
import { questionsRouter } from './routes/questions.js'
import { blocksRouter } from './routes/blocks.js'
import { progressRouter } from './routes/progress.js'
import { playgroundRouter } from './routes/playground.js'
import { authRouter } from './routes/auth.js'
import { telegramRouter } from './routes/telegram.js'
import { internalRouter } from './routes/internal.js'
import { articlesRouter } from './routes/articles.js'

const app = new Hono()

// ── Middleware ────────────────────────────────────────────────────────────────
app.use('*', logger())
app.use(
  '*',
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
  }),
)

// ── Routes ────────────────────────────────────────────────────────────────────
const apiRoutes = app
  .route('/api/auth', authRouter)
  .route('/api/questions', questionsRouter)
  .route('/api/blocks', blocksRouter)
  .route('/api/progress', progressRouter)
  .route('/api/playground', playgroundRouter)
  .route('/api/telegram', telegramRouter)
  .route('/api/internal', internalRouter)
  .route('/api/articles', articlesRouter)

// Health check
app.get('/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() }, 200),
)

// ── Error handler (REQUIRED in Hono v4 — validators throw by default) ─────────
app.onError(errorHandler)

// 404
app.notFound((c) =>
  c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404),
)

// Export AppType for Hono RPC client
export type AppType = typeof apiRoutes
export { app }
