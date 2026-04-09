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

    // Auth
    JWT_SECRET: z.string().min(32).default('dev-jwt-secret-change-in-production-please'),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    YANDEX_CLIENT_ID: z.string().min(1).optional(),
    YANDEX_CLIENT_SECRET: z.string().min(1).optional(),
    TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
    INTERNAL_API_KEY: z.string().min(32).optional(),

    // MinIO
    MINIO_ENDPOINT: z.string().default('localhost:9000'),
    MINIO_ACCESS_KEY: z.string().default('minioadmin'),
    MINIO_SECRET_KEY: z.string().default('minioadmin'),
    MINIO_BUCKET: z.string().default('articles-images'),
    MINIO_PUBLIC_URL: z.string().default('http://localhost:9000/articles-images'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
