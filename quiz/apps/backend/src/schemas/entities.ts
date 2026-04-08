/**
 * Server-side MongoDB entity types.
 * These use ObjectId and Date — never send to the client directly.
 * Convert to DTOs via toXxxDTO() functions in services.
 */
import { ObjectId } from 'mongodb'
import type { DifficultyLevel } from '@quiz/shared'

// ── Questions ───────────────────────────────────────────────────────────────

interface BaseQuestionEntity {
  _id: ObjectId
  legacyId?: number        // original numeric id from the TS files
  quizId: number | null
  blockId: string | null
  difficulty: DifficultyLevel
  tags: string[]
  explanation: { ru: string; en: string }
  createdAt: Date
  updatedAt: Date
}

export interface MCQQuestionEntity extends BaseQuestionEntity {
  type: 'mcq'
  question: { ru: string; en: string }
  code?: string
  options: { ru: [string, string, string, string]; en: [string, string, string, string] }
  correct: 0 | 1 | 2 | 3
}

export type QuestionEntity = MCQQuestionEntity

// ── Blocks ───────────────────────────────────────────────────────────────────

export interface BlockEntity {
  _id: ObjectId
  blockId: string          // stable string id e.g. "concurrency"
  parentBlockId?: string   // parent block for sub-quizzes
  title: { ru: string; en: string }
  subtitle: { ru: string; en: string }
  difficulty: DifficultyLevel
  topicCount: number
  topics: { ru: string[]; en: string[] }
  quizId: number | null
  gridRow: number
  gridCol: number
  color: string
  createdAt: Date
  updatedAt: Date
}

// ── Progress ─────────────────────────────────────────────────────────────────

export interface ProgressEntity {
  _id: ObjectId
  sessionId: string
  blockId: string
  quizId: number | null
  score: number
  total: number
  completedAt: Date
}
