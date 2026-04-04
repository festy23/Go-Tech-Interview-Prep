import { blocksCol } from '../db/collections.js'
import type { BlockEntity } from '../schemas/entities.js'
import type { BlockDTO } from '@quiz/shared'

function toDTO(entity: BlockEntity): BlockDTO {
  return {
    id: entity.blockId,
    title: entity.title,
    difficulty: entity.difficulty,
    topicCount: entity.topicCount,
    topics: entity.topics,
    quizId: entity.quizId,
    gridRow: entity.gridRow,
    gridCol: entity.gridCol,
    color: entity.color,
  }
}

export async function getAllBlocks(): Promise<BlockDTO[]> {
  const col = await blocksCol()
  const docs = await col.find({}).sort({ gridRow: 1, gridCol: 1 }).toArray()
  return docs.map(toDTO)
}

export async function getBlockById(blockId: string): Promise<BlockDTO | null> {
  const col = await blocksCol()
  const doc = await col.findOne({ blockId })
  return doc ? toDTO(doc) : null
}
