import { Google } from 'arctic'
import { env } from '../../env.js'
import type { OAuthProvider, OAuthUserInfo } from './types.js'

let client: Google | null = null
function getClient(): Google {
  if (!client) {
    client = new Google(env.GOOGLE_CLIENT_ID!, env.GOOGLE_CLIENT_SECRET!, `${env.CORS_ORIGIN}/api/auth/google/callback`)
  }
  return client
}

export const googleProvider: OAuthProvider = {
  getAuthorizationUrl(state: string, codeVerifier?: string): URL {
    return getClient().createAuthorizationURL(state, codeVerifier ?? '', [
      'openid',
      'email',
      'profile',
    ])
  },

  async exchangeCode(code: string, codeVerifier?: string): Promise<string> {
    const tokens = await getClient().validateAuthorizationCode(code, codeVerifier ?? '')
    return tokens.accessToken()
  },

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Google userinfo failed: ${res.status}`)
    const data = (await res.json()) as {
      id: string
      email?: string
      verified_email?: boolean
      name?: string
      picture?: string
    }
    return {
      providerUserId: data.id,
      email: data.verified_email ? (data.email ?? null) : null,
      name: data.name ?? 'Google User',
      avatarUrl: data.picture ?? null,
    }
  },
}
