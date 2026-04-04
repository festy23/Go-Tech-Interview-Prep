import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const env = createEnv({
  server: {
    PORT: z.coerce.number().int().optional(),
    MONGODB_URI: z.string().min(1),
    MONGODB_DB_NAME: z.string().min(1).default('go_quiz'),
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
