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
  quizId: 1 | 2 | 3 | null
  blockId: string | null
  difficulty: DifficultyLevel
  tags: string[]
  explanation: string
  createdAt: Date
  updatedAt: Date
}

export interface MCQQuestionEntity extends BaseQuestionEntity {
  type: 'mcq'
  question: string
  code?: string
  options: [string, string, string, string]
  correct: 0 | 1 | 2 | 3
}

export type QuestionEntity = MCQQuestionEntity

// ── Blocks ───────────────────────────────────────────────────────────────────

export interface BlockEntity {
  _id: ObjectId
  blockId: string          // stable string id e.g. "concurrency"
  title: string
  difficulty: DifficultyLevel
  topicCount: number
  topics: string[]
  quizId: 1 | 2 | 3 | null
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
  quizId: 1 | 2 | 3 | null
  score: number
  total: number
  completedAt: Date
}
