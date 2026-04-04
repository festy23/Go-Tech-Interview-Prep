import type { Collection } from 'mongodb'
import { ObjectId } from 'mongodb'
import { getDb } from './client.js'
import type {
  QuestionEntity,
  ProgressEntity,
  BlockEntity,
} from '../schemas/entities.js'

export async function questionsCol(): Promise<Collection<QuestionEntity>> {
  const db = await getDb()
  return db.collection<QuestionEntity>('questions')
}

export async function blocksCol(): Promise<Collection<BlockEntity>> {
  const db = await getDb()
  return db.collection<BlockEntity>('blocks')
}

export async function progressCol(): Promise<Collection<ProgressEntity>> {
  const db = await getDb()
  return db.collection<ProgressEntity>('progress')
}

export { ObjectId }

export async function ensureIndexes(): Promise<void> {
  const qCol = await questionsCol()
  await qCol.createIndex({ quizId: 1 })
  await qCol.createIndex({ blockId: 1 })
  await qCol.createIndex({ quizId: 1, blockId: 1 })

  const pCol = await progressCol()
  await pCol.createIndex({ sessionId: 1 })
  await pCol.createIndex({ sessionId: 1, blockId: 1 })

  console.log('[db] Indexes ensured')
}
