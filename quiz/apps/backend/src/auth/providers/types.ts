export interface OAuthUserInfo {
  providerUserId: string
  email: string | null
  name: string
  avatarUrl: string | null
}

export interface OAuthProvider {
  getAuthorizationUrl(state: string, codeVerifier?: string): URL
  exchangeCode(code: string, codeVerifier?: string): Promise<string>
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>
}
