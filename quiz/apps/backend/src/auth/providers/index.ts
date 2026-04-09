import type { OAuthProviderName } from '../../schemas/entities.js'
import type { OAuthProvider } from './types.js'
import { googleProvider } from './google.js'
import { githubProvider } from './github.js'
import { yandexProvider } from './yandex.js'

export const providers: Record<OAuthProviderName, OAuthProvider> = {
  google: googleProvider,
  github: githubProvider,
  yandex: yandexProvider,
}

/** Whether this provider requires PKCE code verifier */
export function requiresPkce(provider: OAuthProviderName): boolean {
  return provider === 'google'
}

export type { OAuthProvider, OAuthUserInfo } from './types.js'
