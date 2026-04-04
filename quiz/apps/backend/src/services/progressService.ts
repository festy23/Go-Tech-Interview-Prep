import { progressCol } from '../db/collections.js'
import type { ProgressEntity } from '../schemas/entities.js'
import type { SaveProgressInput, SessionProgressDTO, ProgressEntryDTO } from '@quiz/shared'

function toEntryDTO(entity: ProgressEntity): ProgressEntryDTO {
  return {
    id: entity._id.toHexString(),
    sessionId: entity.sessionId,
    blockId: entity.blockId,
    quizId: entity.quizId,
    score: entity.score,
    total: entity.total,
    pct: Math.round((entity.score / entity.total) * 100),
    completedAt: entity.completedAt.toISOString(),
  }
}

export async function saveProgress(
  input: SaveProgressInput,
): Promise<ProgressEntryDTO> {
  const col = await progressCol()

  const entity: Omit<ProgressEntity, '_id'> = {
    sessionId: input.sessionId,
    blockId: input.blockId,
    quizId: input.quizId,
    score: input.score,
    total: input.total,
    completedAt: new Date(),
  }

  // Always insert a new attempt (full history); best score computed on read
  const result = await col.insertOne(entity as ProgressEntity)
  const inserted = await col.findOne({ _id: result.insertedId })
  if (!inserted) throw new Error('Failed to retrieve inserted progress')
  return toEntryDTO(inserted)
}

export async function getSessionProgress(
  sessionId: string,
): Promise<SessionProgressDTO> {
  const col = await progressCol()

  const entries = await col
    .find({ sessionId })
    .sort({ completedAt: -1 })
    .toArray()

  // Group by blockId — keep best score per block
  const byBlock: Record<string, ProgressEntryDTO> = {}
  for (const entry of entries) {
    const dto = toEntryDTO(entry)
    const existing = byBlock[entry.blockId]
    if (!existing || dto.score > existing.score) {
      byBlock[entry.blockId] = dto
    }
  }

  return { sessionId, byBlock }
}
