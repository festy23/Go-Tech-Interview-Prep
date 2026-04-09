import { sign, verify } from 'hono/jwt'
import { generateState } from 'arctic'
import { env } from '../env.js'
import { refreshTokensCol, ObjectId } from '../db/collections.js'
import type { RefreshTokenEntity } from '../schemas/entities.js'

const ACCESS_TOKEN_TTL = 15 * 60 // 15 minutes
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 // 30 days

// ── Access Token (JWT) ──────────────────────────────────────────────────────

interface AccessTokenPayload {
  sub: string
  email: string | null
  name: string
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return sign(
    { ...payload, iat: now, exp: now + ACCESS_TOKEN_TTL },
    env.JWT_SECRET,
  )
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenPayload> {
  const payload = await verify(token, env.JWT_SECRET)
  return {
    sub: payload.sub as string,
    email: (payload.email as string | null) ?? null,
    name: payload.name as string,
  }
}

// ── Refresh Token (opaque + SHA-256 hash in DB) ─────────────────────────────

async function hashToken(raw: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(raw)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function createRefreshToken(userId: string): Promise<string> {
  const raw = generateState()
  const tokenHash = await hashToken(raw)
  const col = await refreshTokensCol()
  const doc: Omit<RefreshTokenEntity, '_id'> = {
    userId: new ObjectId(userId),
    tokenHash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL * 1000),
    createdAt: new Date(),
  }
  await col.insertOne(doc as RefreshTokenEntity)
  return raw
}

export async function validateRefreshToken(
  raw: string,
): Promise<string | null> {
  const tokenHash = await hashToken(raw)
  const col = await refreshTokensCol()
  const doc = await col.findOne({ tokenHash })
  if (!doc) return null
  if (doc.expiresAt < new Date()) {
    await col.deleteOne({ _id: doc._id })
    return null
  }
  return doc.userId.toHexString()
}

export async function deleteRefreshToken(raw: string): Promise<void> {
  const tokenHash = await hashToken(raw)
  const col = await refreshTokensCol()
  await col.deleteOne({ tokenHash })
}

export async function deleteAllUserRefreshTokens(
  userId: string,
): Promise<void> {
  const col = await refreshTokensCol()
  await col.deleteMany({ userId: new ObjectId(userId) })
}

export { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL }
