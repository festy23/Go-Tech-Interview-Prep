/**
 * Vercel Serverless Function entry point.
 * Built by tsup alongside the main backend, then imported by api/index.js.
 */
import { app } from './app.js'
import { getDb } from './db/client.js'
import { ensureIndexes } from './db/collections.js'

let initPromise: Promise<void> | null = null

function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = getDb()
      .then(() => ensureIndexes())
      .catch((err) => {
        initPromise = null
        return Promise.reject(err)
      })
  }
  return initPromise
}

export default async function handler(req: Request): Promise<Response> {
  await ensureInit()
  return app.fetch(req)
}
