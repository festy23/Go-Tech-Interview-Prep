import { Hono, type Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { zValidator } from '@hono/zod-validator'
import { generateCodeVerifier } from 'arctic'
import { MigrateProgressInputSchema } from '@quiz/shared'
import { env } from '../env.js'
import { providers, requiresPkce } from '../auth/providers/index.js'
import { createOAuthState, validateAndConsumeState } from '../auth/stateService.js'
import {
  findOrCreateUser,
  getUserById,
  toUserDTO,
  migrateProgress,
} from '../auth/authService.js'
import {
  signAccessToken,
  createRefreshToken,
  validateRefreshToken,
  deleteRefreshToken,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
} from '../auth/tokenService.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { usersCol } from '../db/collections.js'
import type { OAuthProviderName } from '../schemas/entities.js'

const VALID_PROVIDERS = new Set<string>(['google', 'github', 'yandex'])
const IS_PRODUCTION = env.NODE_ENV === 'production'

function setTokenCookies(
  c: Context,
  accessToken: string,
  refreshToken: string,
): void {
  setCookie(c, 'access_token', accessToken, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'Lax',
    path: '/api',
    maxAge: ACCESS_TOKEN_TTL,
  })
  setCookie(c, 'refresh_token', refreshToken, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'Lax',
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_TTL,
  })
}

function clearTokenCookies(c: Context): void {
  deleteCookie(c, 'access_token', { path: '/api' })
  deleteCookie(c, 'refresh_token', { path: '/api/auth' })
}

export const authRouter = new Hono()

  // ── Login redirect ──────────────────────────────────────────────────────────
  .get('/:provider/login', async (c) => {
    const provider = c.req.param('provider')
    if (!VALID_PROVIDERS.has(provider)) {
      return c.json(
        { error: { code: 'BAD_REQUEST', message: 'Invalid provider' } },
        400,
      )
    }
    const providerName = provider as OAuthProviderName
    const sessionId = c.req.query('sessionId') ?? null

    const needsPkce = requiresPkce(providerName)
    const codeVerifier = needsPkce ? generateCodeVerifier() : null
    const state = await createOAuthState(providerName, sessionId, codeVerifier)

    const oauthProvider = providers[providerName]
    const url = oauthProvider.getAuthorizationUrl(state, codeVerifier ?? undefined)

    return c.redirect(url.toString())
  })

  // ── OAuth callback ──────────────────────────────────────────────────────────
  .get('/:provider/callback', async (c) => {
    const code = c.req.query('code')
    const state = c.req.query('state')
    const error = c.req.query('error')

    if (error) {
      console.error(`[auth] OAuth error from provider: ${error}`)
      return c.redirect(`${env.CORS_ORIGIN}/?auth=error`)
    }

    if (!code || !state) {
      return c.redirect(`${env.CORS_ORIGIN}/?auth=error`)
    }

    // Validate state (CSRF protection)
    const stateData = await validateAndConsumeState(state)
    if (!stateData) {
      console.error('[auth] Invalid or expired OAuth state')
      return c.redirect(`${env.CORS_ORIGIN}/?auth=error`)
    }

    try {
      const oauthProvider = providers[stateData.provider]

      // Exchange code for access token
      const providerAccessToken = await oauthProvider.exchangeCode(
        code,
        stateData.codeVerifier ?? undefined,
      )

      // Fetch user info from provider
      const userInfo = await oauthProvider.getUserInfo(providerAccessToken)

      // Find or create user in our DB
      const user = await findOrCreateUser(userInfo, stateData.provider)

      // Generate our own tokens
      const accessToken = await signAccessToken({
        sub: user._id.toHexString(),
        email: user.email,
        name: user.name,
      })
      const refreshToken = await createRefreshToken(user._id.toHexString())

      // Set cookies and redirect to frontend
      setTokenCookies(c, accessToken, refreshToken)

      const redirectUrl = new URL(env.CORS_ORIGIN)
      redirectUrl.searchParams.set('auth', 'success')
      if (stateData.anonymousSessionId) {
        redirectUrl.searchParams.set('migrateSession', stateData.anonymousSessionId)
      }
      return c.redirect(redirectUrl.toString())
    } catch (err) {
      console.error('[auth] OAuth callback error:', err)
      return c.redirect(`${env.CORS_ORIGIN}/?auth=error`)
    }
  })

  // ── Get current user ────────────────────────────────────────────────────────
  .get('/me', requireAuth, async (c) => {
    const authUser = c.get('user')
    const user = await getUserById(authUser.id)
    if (!user) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: 'User not found' } },
        404,
      )
    }

    // Track last seen for smart reminders (fire-and-forget)
    usersCol().then((col) =>
      col.updateOne(
        { _id: user._id },
        { $set: { lastSeenAt: new Date() } },
      ),
    )

    return c.json({ data: toUserDTO(user) })
  })

  // ── Refresh tokens ──────────────────────────────────────────────────────────
  .post('/refresh', async (c) => {
    const raw = getCookie(c, 'refresh_token')
    if (!raw) {
      return c.json(
        { error: { code: 'UNAUTHORIZED', message: 'No refresh token' } },
        401,
      )
    }

    const userId = await validateRefreshToken(raw)
    if (!userId) {
      clearTokenCookies(c)
      return c.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } },
        401,
      )
    }

    // Rotate: delete old, fetch user in parallel
    const [, user] = await Promise.all([
      deleteRefreshToken(raw),
      getUserById(userId),
    ])
    if (!user) {
      clearTokenCookies(c)
      return c.json(
        { error: { code: 'UNAUTHORIZED', message: 'User not found' } },
        401,
      )
    }

    const accessToken = await signAccessToken({
      sub: userId,
      email: user.email,
      name: user.name,
    })
    const refreshToken = await createRefreshToken(userId)

    setTokenCookies(c, accessToken, refreshToken)
    return c.json({ data: toUserDTO(user) })
  })

  // ── Logout ──────────────────────────────────────────────────────────────────
  .post('/logout', requireAuth, async (c) => {
    const raw = getCookie(c, 'refresh_token')
    if (raw) await deleteRefreshToken(raw)
    clearTokenCookies(c)
    return c.json({ data: { success: true } })
  })

  // ── Migrate anonymous progress ──────────────────────────────────────────────
  .post(
    '/migrate-progress',
    requireAuth,
    zValidator('json', MigrateProgressInputSchema),
    async (c) => {
      const authUser = c.get('user')
      const { sessionId } = c.req.valid('json')
      const count = await migrateProgress(authUser.id, sessionId)
      return c.json({ data: { migratedCount: count } })
    },
  )
