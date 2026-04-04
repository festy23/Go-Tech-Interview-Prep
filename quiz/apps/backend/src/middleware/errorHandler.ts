import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'
import { ZodError } from 'zod'

export function errorHandler(err: Error, c: Context) {
  // Hono HTTP exceptions (includes zod-validator failures in v4)
  if (err instanceof HTTPException) {
    return c.json(
      { error: { code: 'HTTP_ERROR', message: err.message } },
      err.status,
    )
  }

  // Zod validation errors (manual z.parse() calls in services)
  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: err.flatten().fieldErrors,
        },
      },
      422,
    )
  }

  // Unknown errors — log server-side, return generic message
  console.error('[error]', err)
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    500,
  )
}
