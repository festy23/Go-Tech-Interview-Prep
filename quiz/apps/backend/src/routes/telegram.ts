import { Hono } from 'hono'
import { requireAuth } from '../middleware/authMiddleware.js'
import { usersCol, ObjectId, telegramLinkTokensCol } from '../db/collections.js'
import type { TelegramLinkTokenEntity } from '../schemas/entities.js'

export const telegramRouter = new Hono()

  // Generate link token for deep link
  .post('/generate-link', requireAuth, async (c) => {
    const authUser = c.get('user')
    const col = await telegramLinkTokensCol()

    // Generate random token
    const token = crypto.randomUUID().replace(/-/g, '')

    // Store with 10 min TTL
    await col.insertOne({
      token,
      userId: new ObjectId(authUser.id),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      createdAt: new Date(),
    } as TelegramLinkTokenEntity)

    return c.json({ data: { token } })
  })

  .get('/status', requireAuth, async (c) => {
    const authUser = c.get('user')
    const col = await usersCol()
    const user = await col.findOne(
      { _id: new ObjectId(authUser.id) },
      { projection: { telegramId: 1 } },
    )
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
