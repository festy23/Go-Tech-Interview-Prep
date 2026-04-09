import { createHmac, createHash } from 'node:crypto'
import { env } from '../env.js'

export interface TelegramLoginData {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export function verifyTelegramAuth(data: TelegramLoginData): boolean {
  if (!env.TELEGRAM_BOT_TOKEN) return false

  const now = Math.floor(Date.now() / 1000)
  if (now - data.auth_date > 3600) return false

  const { hash, ...rest } = data
  const checkString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key as keyof typeof rest]}`)
    .join('\n')

  const secretKey = createHash('sha256')
    .update(env.TELEGRAM_BOT_TOKEN)
    .digest()

  const hmac = createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex')

  return hmac === hash
}
