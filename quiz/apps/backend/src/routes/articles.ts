import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { getArticle, listArticles } from '../services/articleService.js'
import type { Lang } from '@quiz/shared'

const ArticleQuerySchema = z.object({
  lang: z.enum(['ru', 'en']).default('ru'),
})

const ArticleListQuerySchema = z.object({
  parentBlockId: z.string().optional(),
  lang: z.enum(['ru', 'en']).default('ru'),
})

export const articlesRouter = new Hono()

  .get('/:blockId', zValidator('query', ArticleQuerySchema), async (c) => {
    const blockId = c.req.param('blockId')
    const { lang } = c.req.valid('query')
    const article = await getArticle(blockId, lang as Lang)
    if (!article) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: 'Article not found' } },
        404,
      )
    }
    return c.json({ data: article })
  })

  .get('/', zValidator('query', ArticleListQuerySchema), async (c) => {
    const { parentBlockId, lang } = c.req.valid('query')
    const articles = await listArticles(parentBlockId, lang as Lang)
    return c.json({ data: articles })
  })
