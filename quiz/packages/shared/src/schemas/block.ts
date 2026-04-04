import { z } from 'zod'
import { DifficultyLevelSchema } from './question.js'

export const BlockDTOSchema = z.object({
  id: z.string(),
  title: z.string(),
  difficulty: DifficultyLevelSchema,
  topicCount: z.number().int(),
  topics: z.array(z.string()),
  quizId: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  gridRow: z.number().int(),
  gridCol: z.number().int(),
  color: z.string(),
})
export type BlockDTO = z.infer<typeof BlockDTOSchema>
