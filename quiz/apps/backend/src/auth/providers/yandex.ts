import { Yandex } from 'arctic'
import { env } from '../../env.js'
import type { OAuthProvider, OAuthUserInfo } from './types.js'

let client: Yandex | null = null
function getClient(): Yandex {
  if (!client) {
    client = new Yandex(env.YANDEX_CLIENT_ID!, env.YANDEX_CLIENT_SECRET!, `${env.CORS_ORIGIN}/api/auth/yandex/callback`)
  }
  return client
}

export const yandexProvider: OAuthProvider = {
  getAuthorizationUrl(state: string): URL {
    return getClient().createAuthorizationURL(state, ['login:email', 'login:info'])
  },

  async exchangeCode(code: string): Promise<string> {
    const tokens = await getClient().validateAuthorizationCode(code)
    return tokens.accessToken()
  },

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    const res = await fetch('https://login.yandex.ru/info?format=json', {
      headers: { Authorization: `OAuth ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Yandex userinfo failed: ${res.status}`)
    const data = (await res.json()) as {
      id: string
      display_name?: string
      real_name?: string
      default_email?: string
      default_avatar_id?: string
      is_avatar_empty?: boolean
    }
    const avatarUrl =
      data.is_avatar_empty === false && data.default_avatar_id
        ? `https://avatars.yandex.net/get-yapic/${data.default_avatar_id}/islands-200`
        : null

    return {
      providerUserId: data.id,
      email: data.default_email ?? null,
      name: data.display_name ?? data.real_name ?? 'Yandex User',
      avatarUrl,
    }
  },
}
