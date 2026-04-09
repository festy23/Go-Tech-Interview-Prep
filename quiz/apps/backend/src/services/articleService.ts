import { articlesCol } from '../db/collections.js'
import { env } from '../env.js'
import type { ArticleEntity } from '../schemas/entities.js'
import type { ArticleDTO, ArticleListItem, Lang } from '@quiz/shared'

function toDTO(entity: ArticleEntity, lang: Lang): ArticleDTO {
  return {
    id: entity._id.toHexString(),
    blockId: entity.blockId,
    parentBlockId: entity.parentBlockId,
    title: entity.title[lang],
    content: entity.content[lang].replaceAll(
      '{{IMAGES_BASE_URL}}',
      env.MINIO_PUBLIC_URL,
    ),
    readingTimeMin: entity.readingTimeMin,
  }
}

function toListItem(entity: ArticleEntity, lang: Lang): ArticleListItem {
  return {
    blockId: entity.blockId,
    parentBlockId: entity.parentBlockId,
    title: entity.title[lang],
    readingTimeMin: entity.readingTimeMin,
  }
}

export async function getArticle(
  blockId: string,
  lang: Lang = 'ru',
): Promise<ArticleDTO | null> {
  const col = await articlesCol()
  const doc = await col.findOne({ blockId })
  return doc ? toDTO(doc, lang) : null
}

export async function listArticles(
  parentBlockId: string | undefined,
  lang: Lang = 'ru',
): Promise<ArticleListItem[]> {
  const col = await articlesCol()
  const filter = parentBlockId ? { parentBlockId } : {}
  const docs = await col.find(filter).sort({ blockId: 1 }).toArray()
  return docs.map((d) => toListItem(d, lang))
}
