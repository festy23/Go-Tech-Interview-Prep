import { z } from 'zod'

export const SaveProgressSchema = z.object({
  sessionId: z.string().uuid(),
  blockId: z.string(),
  quizId: z.number().int().positive().nullable(),
  score: z.number().int().min(0),
  total: z.number().int().min(1),
})
export type SaveProgressInput = z.infer<typeof SaveProgressSchema>

export const ProgressEntryDTOSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  blockId: z.string(),
  quizId: z.number().int().positive().nullable(),
  score: z.number().int(),
  total: z.number().int(),
  pct: z.number().int(),
  completedAt: z.string().datetime(),
})
export type ProgressEntryDTO = z.infer<typeof ProgressEntryDTOSchema>

export const SessionProgressDTOSchema = z.object({
  sessionId: z.string(),
  byBlock: z.record(z.string(), ProgressEntryDTOSchema),
})
export type SessionProgressDTO = z.infer<typeof SessionProgressDTOSchema>
