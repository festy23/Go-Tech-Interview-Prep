import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { HTTPException } from 'hono/http-exception'
import { LangSchema } from '@quiz/shared'
import { getAllBlocks, getBlockById } from '../services/blockService.js'

const BlockQuerySchema = z.object({
  lang: LangSchema.default('ru').optional(),
})

export const blocksRouter = new Hono()
  .get('/', zValidator('query', BlockQuerySchema), async (c) => {
    const { lang } = c.req.valid('query')
    const blocks = await getAllBlocks(lang)
    return c.json({ data: blocks }, 200)
  })
  .get('/:id', zValidator('query', BlockQuerySchema), async (c) => {
    const { lang } = c.req.valid('query')
    const id = c.req.param('id')
    const block = await getBlockById(id, lang)
    if (!block) throw new HTTPException(404, { message: `Block '${id}' not found` })
    return c.json({ data: block }, 200)
  })
