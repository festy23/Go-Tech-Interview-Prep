import { generateState } from 'arctic'
import { oauthStatesCol } from '../db/collections.js'
import type { OAuthProviderName, OAuthStateEntity } from '../schemas/entities.js'

const STATE_TTL = 10 * 60 // 10 minutes

export async function createOAuthState(
  provider: OAuthProviderName,
  anonymousSessionId: string | null,
  codeVerifier: string | null,
): Promise<string> {
  const state = generateState()
  const col = await oauthStatesCol()
  const doc: Omit<OAuthStateEntity, '_id'> = {
    state,
    provider,
    codeVerifier,
    anonymousSessionId,
    expiresAt: new Date(Date.now() + STATE_TTL * 1000),
    createdAt: new Date(),
  }
  await col.insertOne(doc as OAuthStateEntity)
  return state
}

export async function validateAndConsumeState(
  state: string,
): Promise<{
  provider: OAuthProviderName
  codeVerifier: string | null
  anonymousSessionId: string | null
} | null> {
  const col = await oauthStatesCol()
  // Atomic consume — TTL index handles expiry
  const doc = await col.findOneAndDelete({ state })
  if (!doc) return null
  return {
    provider: doc.provider,
    codeVerifier: doc.codeVerifier,
    anonymousSessionId: doc.anonymousSessionId,
  }
}
