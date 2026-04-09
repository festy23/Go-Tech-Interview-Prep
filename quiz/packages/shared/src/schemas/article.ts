import { z } from 'zod'

export const ArticleDTOSchema = z.object({
  id: z.string(),
  blockId: z.string(),
  parentBlockId: z.string().nullable(),
  title: z.string(),
  content: z.string(),
  readingTimeMin: z.number(),
})
export type ArticleDTO = z.infer<typeof ArticleDTOSchema>

export const ArticleListItemSchema = z.object({
  blockId: z.string(),
  parentBlockId: z.string().nullable(),
  title: z.string(),
  readingTimeMin: z.number(),
})
export type ArticleListItem = z.infer<typeof ArticleListItemSchema>
