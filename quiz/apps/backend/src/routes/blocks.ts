import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getAllBlocks, getBlockById } from '../services/blockService.js'

export const blocksRouter = new Hono()
  .get('/', async (c) => {
    const blocks = await getAllBlocks()
    return c.json({ data: blocks }, 200)
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id')
    const block = await getBlockById(id)
    if (!block) throw new HTTPException(404, { message: `Block '${id}' not found` })
    return c.json({ data: block }, 200)
  })
