/**
 * Hono RPC-compatible API client.
 * Import `AppType` from the backend for full type safety.
 *
 * Note: we use a thin fetch-based wrapper here instead of hc<AppType>
 * to avoid build-time dependency on the backend source.
 * Types are validated at runtime with Zod (shared package).
 */
import { QuestionDTOSchema, BlockDTOSchema, SessionProgressDTOSchema, UserDTOSchema, ArticleDTOSchema, ArticleListItemSchema } from '@quiz/shared'
import { z } from 'zod'
import type { QuestionDTO, BlockDTO, SessionProgressDTO, SaveProgressInput, UserDTO, ArticleDTO, ArticleListItem } from '@quiz/shared'
import i18n from '../i18n'

const BASE = '/api'

function getLang(): string {
  return i18n.language || 'ru'
}

async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(body?.error?.message ?? `API error ${res.status}`)
  }

  return res.json() as Promise<T>
}

// ── Questions ─────────────────────────────────────────────────────────────────

export async function fetchQuestions(params: {
  quizId?: number
  blockId?: string
  shuffle?: boolean
  limit?: number
}): Promise<QuestionDTO[]> {
  const query = new URLSearchParams()
  query.set('lang', getLang())
  if (params.quizId !== undefined) query.set('quizId', String(params.quizId))
  if (params.blockId !== undefined) query.set('blockId', params.blockId)
  if (params.shuffle) query.set('shuffle', 'true')
  if (params.limit !== undefined) query.set('limit', String(params.limit))

  const qs = query.toString() ? `?${query.toString()}` : ''
  const res = await apiFetch<{ data: unknown[] }>(`/questions${qs}`)
  return z.array(QuestionDTOSchema).parse(res.data)
}

// ── Blocks ────────────────────────────────────────────────────────────────────

export async function fetchBlocks(): Promise<BlockDTO[]> {
  const res = await apiFetch<{ data: unknown[] }>(`/blocks?lang=${getLang()}`)
  return z.array(BlockDTOSchema).parse(res.data)
}

export async function fetchBlock(id: string): Promise<BlockDTO> {
  const res = await apiFetch<{ data: unknown }>(`/blocks/${id}?lang=${getLang()}`)
  return BlockDTOSchema.parse(res.data)
}

// ── Progress ──────────────────────────────────────────────────────────────────

export async function saveProgress(input: SaveProgressInput): Promise<void> {
  await apiFetch('/progress', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function fetchSessionProgress(
  sessionId: string,
): Promise<SessionProgressDTO> {
  const res = await apiFetch<{ data: unknown }>(`/progress/${sessionId}`)
  return SessionProgressDTOSchema.parse(res.data)
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function fetchMe(): Promise<UserDTO | null> {
  try {
    const res = await apiFetch<{ data: unknown }>('/auth/me')
    return UserDTOSchema.parse(res.data)
  } catch {
    return null
  }
}

export async function refreshAuth(): Promise<UserDTO | null> {
  try {
    const res = await apiFetch<{ data: unknown }>('/auth/refresh', {
      method: 'POST',
    })
    return UserDTOSchema.parse(res.data)
  } catch {
    return null
  }
}

export async function logoutAuth(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' })
  } catch {
    // Ignore errors on logout
  }
}

export async function fetchMyProgress(): Promise<SessionProgressDTO> {
  const res = await apiFetch<{ data: unknown }>('/progress/me')
  return SessionProgressDTOSchema.parse(res.data)
}

export async function migrateProgressToUser(
  sessionId: string,
): Promise<number> {
  try {
    const res = await apiFetch<{ data: { migratedCount: number } }>(
      '/auth/migrate-progress',
      {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      },
    )
    return res.data.migratedCount
  } catch {
    return 0
  }
}

// ── Articles ────────────────────────────────────────────────────────────────

export async function fetchArticle(blockId: string): Promise<ArticleDTO> {
  const res = await apiFetch<{ data: unknown }>(`/articles/${blockId}?lang=${getLang()}`)
  return ArticleDTOSchema.parse(res.data)
}

export async function fetchArticleList(parentBlockId?: string): Promise<ArticleListItem[]> {
  const query = new URLSearchParams({ lang: getLang() })
  if (parentBlockId) query.set('parentBlockId', parentBlockId)
  const res = await apiFetch<{ data: unknown[] }>(`/articles?${query.toString()}`)
  return z.array(ArticleListItemSchema).parse(res.data)
}

// ── Telegram ────────────────────────────────────────────────────────────────

export async function generateTelegramLink(): Promise<{ token: string }> {
  const res = await apiFetch<{ data: { token: string } }>(
    '/telegram/generate-link',
    { method: 'POST' },
  )
  return res.data
}

export async function getTelegramStatus(): Promise<{
  linked: boolean
  telegramId: number | null
}> {
  const res = await apiFetch<{
    data: { linked: boolean; telegramId: number | null }
  }>('/telegram/status')
  return res.data
}

export async function unlinkTelegram(): Promise<void> {
  await apiFetch('/telegram/link', { method: 'DELETE' })
}

// ── Playground ───────────────────────────────────────────────────────────────

export interface PlaygroundEvent {
  Message: string
  Kind: string
  Delay: number
}

export interface PlaygroundResult {
  Errors: string
  Events?: PlaygroundEvent[]
}

export async function runPlayground(input: {
  body: string
  goVersion?: string
  withVet?: boolean
}): Promise<PlaygroundResult> {
  return apiFetch<PlaygroundResult>('/playground/run', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
