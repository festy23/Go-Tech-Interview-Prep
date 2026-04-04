import 'dotenv/config'
import { serve } from '@hono/node-server'
import { app } from './app.js'
import { getDb, closeDb } from './db/client.js'
import { ensureIndexes } from './db/collections.js'
import { env } from './env.js'

async function main() {
  // Connect to MongoDB before accepting requests — fail fast if unavailable
  await getDb()
  await ensureIndexes()

  const port = env.PORT ?? 3001
  serve(
    { fetch: app.fetch, port },
    () => { console.log(`[server] Listening on http://localhost:${port}`) },
  )
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`[server] ${signal} received, shutting down...`)
  await closeDb()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

main().catch((err) => {
  console.error('[server] Fatal error during startup:', err)
  process.exit(1)
})
