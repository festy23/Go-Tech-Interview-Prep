/**
 * Hono RPC-compatible API client.
 * Import `AppType` from the backend for full type safety.
 *
 * Note: we use a thin fetch-based wrapper here instead of hc<AppType>
 * to avoid build-time dependency on the backend source.
 * Types are validated at runtime with Zod (shared package).
 */
import { QuestionDTOSchema, BlockDTOSchema, SessionProgressDTOSchema } from '@quiz/shared'
import { z } from 'zod'
import type { QuestionDTO, BlockDTO, SessionProgressDTO, SaveProgressInput } from '@quiz/shared'
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
  quizId?: 1 | 2 | 3 | 4 | 5
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
