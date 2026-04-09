import { GitHub } from 'arctic'
import { env } from '../../env.js'
import type { OAuthProvider, OAuthUserInfo } from './types.js'

let client: GitHub | null = null
function getClient(): GitHub {
  if (!client) {
    client = new GitHub(env.GITHUB_CLIENT_ID!, env.GITHUB_CLIENT_SECRET!, `${env.CORS_ORIGIN}/api/auth/github/callback`)
  }
  return client
}

export const githubProvider: OAuthProvider = {
  getAuthorizationUrl(state: string): URL {
    return getClient().createAuthorizationURL(state, ['user:email', 'read:user'])
  },

  async exchangeCode(code: string): Promise<string> {
    const tokens = await getClient().validateAuthorizationCode(code)
    return tokens.accessToken()
  },

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
    }

    const userRes = await fetch('https://api.github.com/user', { headers })
    if (!userRes.ok) throw new Error(`GitHub user failed: ${userRes.status}`)
    const user = (await userRes.json()) as {
      id: number
      login: string
      name?: string | null
      avatar_url?: string
      email?: string | null
    }

    // Fetch primary verified email if not in profile
    let email = user.email ?? null
    if (!email) {
      const emailsRes = await fetch('https://api.github.com/user/emails', { headers })
      if (emailsRes.ok) {
        const emails = (await emailsRes.json()) as {
          email: string
          primary: boolean
          verified: boolean
        }[]
        const primary = emails.find((e) => e.primary && e.verified)
        email = primary?.email ?? null
      }
    }

    return {
      providerUserId: String(user.id),
      email,
      name: user.name ?? user.login,
      avatarUrl: user.avatar_url ?? null,
    }
  },
}
