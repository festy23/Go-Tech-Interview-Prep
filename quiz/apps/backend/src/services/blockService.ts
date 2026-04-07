import { blocksCol } from '../db/collections.js'
import type { BlockEntity } from '../schemas/entities.js'
import type { BlockDTO, Lang } from '@quiz/shared'

function toDTO(entity: BlockEntity, lang: Lang = 'ru'): BlockDTO {
  return {
    id: entity.blockId,
    title: entity.title[lang],
    subtitle: entity.subtitle[lang],
    difficulty: entity.difficulty,
    topicCount: entity.topicCount,
    topics: entity.topics[lang],
    quizId: entity.quizId,
    gridRow: entity.gridRow,
    gridCol: entity.gridCol,
    color: entity.color,
    ...(entity.parentBlockId !== undefined && { parentBlockId: entity.parentBlockId }),
  }
}

export async function getAllBlocks(lang: Lang = 'ru'): Promise<BlockDTO[]> {
  const col = await blocksCol()
  const docs = await col.find({}).sort({ gridRow: 1, gridCol: 1 }).toArray()
  return docs.map((doc) => toDTO(doc, lang))
}

export async function getBlockById(blockId: string, lang: Lang = 'ru'): Promise<BlockDTO | null> {
  const col = await blocksCol()
  const doc = await col.findOne({ blockId })
  return doc ? toDTO(doc, lang) : null
}
