import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { requireAuth } from '../middleware/authMiddleware.js'
import { verifyTelegramAuth, type TelegramLoginData } from '../auth/telegramAuth.js'
import { usersCol, ObjectId } from '../db/collections.js'

const TelegramLinkSchema = z.object({
  id: z.number(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number(),
  hash: z.string(),
})

export const telegramRouter = new Hono()

  .post('/link', requireAuth, zValidator('json', TelegramLinkSchema), async (c) => {
    const authUser = c.get('user')
    const data = c.req.valid('json') as TelegramLoginData

    if (!verifyTelegramAuth(data)) {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Invalid Telegram auth data' } },
        403,
      )
    }

    const col = await usersCol()
    const existing = await col.findOne({ telegramId: data.id })
    if (existing && existing._id.toHexString() !== authUser.id) {
      return c.json(
        { error: { code: 'CONFLICT', message: 'Telegram account already linked to another user' } },
        409,
      )
    }

    await col.updateOne(
      { _id: new ObjectId(authUser.id) },
      { $set: { telegramId: data.id, updatedAt: new Date() } },
    )

    return c.json({ data: { linked: true, telegramId: data.id } })
  })

  .get('/status', requireAuth, async (c) => {
    const authUser = c.get('user')
    const col = await usersCol()
    const user = await col.findOne({ _id: new ObjectId(authUser.id) })
    return c.json({
      data: { linked: !!user?.telegramId, telegramId: user?.telegramId ?? null },
    })
  })

  .delete('/link', requireAuth, async (c) => {
    const authUser = c.get('user')
    const col = await usersCol()
    await col.updateOne(
      { _id: new ObjectId(authUser.id) },
      { $set: { telegramId: null, updatedAt: new Date() } },
    )
    return c.json({ data: { linked: false } })
  })
