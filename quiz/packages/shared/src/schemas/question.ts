import { z } from 'zod'

export const LangSchema = z.enum(['ru', 'en'])
export type Lang = z.infer<typeof LangSchema>

export const DifficultyLevelSchema = z.enum([
  'basic',
  'basic-intermediate',
  'intermediate',
  'intermediate-advanced',
  'advanced',
])
export type DifficultyLevel = z.infer<typeof DifficultyLevelSchema>

// Base fields common to all question types
const BaseQuestionDTOSchema = z.object({
  id: z.string(),
  quizId: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  blockId: z.string().nullable(),
  difficulty: DifficultyLevelSchema,
  tags: z.array(z.string()),
  explanation: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

// Multiple choice question (with optional code snippet)
export const MCQQuestionDTOSchema = BaseQuestionDTOSchema.extend({
  type: z.literal('mcq'),
  question: z.string(),
  code: z.string().optional(),
  options: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  correct: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
})
export type MCQQuestionDTO = z.infer<typeof MCQQuestionDTOSchema>

// Discriminated union — extend here when adding new question types
export const QuestionDTOSchema = z.discriminatedUnion('type', [
  MCQQuestionDTOSchema,
])
export type QuestionDTO = z.infer<typeof QuestionDTOSchema>

// Input schema for creating a question (no id/timestamps — server generates those)
export const CreateMCQQuestionSchema = z.object({
  type: z.literal('mcq'),
  quizId: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  blockId: z.string().nullable(),
  question: z.string().min(5).max(2000),
  code: z.string().max(5000).optional(),
  options: z.tuple([
    z.string().min(1).max(500),
    z.string().min(1).max(500),
    z.string().min(1).max(500),
    z.string().min(1).max(500),
  ]),
  correct: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  explanation: z.string().min(5).max(3000),
  difficulty: DifficultyLevelSchema,
  tags: z.array(z.string().max(50)).max(20).default([]),
})
export type CreateMCQQuestionInput = z.infer<typeof CreateMCQQuestionSchema>

// Query params for listing questions
export const QuestionQuerySchema = z.object({
  quizId: z.coerce.number().pipe(z.union([z.literal(1), z.literal(2), z.literal(3)])).optional(),
  blockId: z.string().optional(),
  shuffle: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  lang: LangSchema.default('ru').optional(),
})
export type QuestionQuery = z.infer<typeof QuestionQuerySchema>
