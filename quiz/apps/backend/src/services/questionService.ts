import type { Filter } from 'mongodb'
import { questionsCol } from '../db/collections.js'
import type { QuestionEntity, MCQQuestionEntity } from '../schemas/entities.js'
import type { QuestionDTO, MCQQuestionDTO, CreateMCQQuestionInput } from '@quiz/shared'

// ── Converters ───────────────────────────────────────────────────────────────

function toDTO(entity: QuestionEntity): QuestionDTO {
  const base = {
    id: entity._id.toHexString(),
    quizId: entity.quizId,
    blockId: entity.blockId,
    difficulty: entity.difficulty,
    tags: entity.tags,
    explanation: entity.explanation,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  }

  if (entity.type === 'mcq') {
    const dto: MCQQuestionDTO = {
      ...base,
      type: 'mcq',
      question: entity.question,
      options: entity.options,
      correct: entity.correct,
      ...(entity.code ? { code: entity.code } : {}),
    }
    return dto
  }

  // Future question types handled here
  throw new Error(`Unknown question type: ${(entity as { type: string }).type}`)
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function getQuestions(params: {
  quizId?: 1 | 2 | 3
  blockId?: string
  shuffle?: boolean
  limit?: number
}): Promise<QuestionDTO[]> {
  const col = await questionsCol()

  const filter: Filter<MCQQuestionEntity> = {}
  if (params.quizId !== undefined) filter['quizId'] = params.quizId
  if (params.blockId !== undefined) filter['blockId'] = params.blockId

  const cursor = col.find(filter)
  const docs = await cursor.toArray()

  let results = docs.map(toDTO)

  if (params.shuffle) {
    // Fisher-Yates shuffle
    for (let i = results.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[results[i], results[j]] = [results[j]!, results[i]!]
    }
  }

  if (params.limit !== undefined) {
    results = results.slice(0, params.limit)
  }

  return results
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function createQuestion(
  input: CreateMCQQuestionInput,
): Promise<QuestionDTO> {
  const col = await questionsCol()

  const now = new Date()
  const entity: Omit<MCQQuestionEntity, '_id'> = {
    type: 'mcq',
    quizId: input.quizId,
    blockId: input.blockId,
    question: input.question,
    options: input.options,
    correct: input.correct,
    explanation: input.explanation,
    difficulty: input.difficulty,
    tags: input.tags,
    createdAt: now,
    updatedAt: now,
    ...(input.code ? { code: input.code } : {}),
  }

  const result = await col.insertOne(entity as MCQQuestionEntity)
  const inserted = await col.findOne({ _id: result.insertedId })
  if (!inserted) throw new Error('Failed to retrieve inserted question')
  return toDTO(inserted)
}

export async function getQuestionCount(filter: {
  quizId?: number
  blockId?: string
}): Promise<number> {
  const col = await questionsCol()
  return col.countDocuments(filter as Filter<MCQQuestionEntity>)
}
