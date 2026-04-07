import { z } from 'zod'
import { DifficultyLevelSchema } from './question.js'

export const BlockDTOSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  difficulty: DifficultyLevelSchema,
  topicCount: z.number().int(),
  topics: z.array(z.string()),
  quizId: z.number().int().positive().nullable(),
  gridRow: z.number().int(),
  gridCol: z.number().int(),
  color: z.string(),
  parentBlockId: z.string().optional(),
})
export type BlockDTO = z.infer<typeof BlockDTOSchema>
