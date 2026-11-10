/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2026 OpenTea Developers
 *
 * @jest-environment node
 */

jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({ handlers: {}, signIn: jest.fn(), signOut: jest.fn(), auth: (fn: unknown) => fn })),
}))
jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }))
jest.mock('next/headers', () => ({ headers: jest.fn() }))

import NextAuth from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { headers } from 'next/headers'
import type { JWT } from 'next-auth/jwt'
import middleware from '@/middleware'
import { logger } from '@/lib/logger'
import { refreshAccessToken } from '@/lib/auth/token-refresh'
import { getCoreToken } from '@/lib/auth/core-token'
import { CoreUnauthorizedError } from '@/domain/errors'

const { jwt: jwtCallback, session: sessionCallback } = (NextAuth as unknown as jest.Mock).mock.calls[0][0].callbacks
const handler = middleware as unknown as (req: unknown, ctx: unknown) => Response

const nowSeconds = () => Math.floor(Date.now() / 1000)
const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
const accessTokenWith = (claims: Record<string, unknown>) => `${base64url({ alg: 'RS256' })}.${base64url(claims)}.signature`

const tokenExpiringIn = (seconds: number): JWT => ({
  sub: 'user-1',
  accessToken: 'old-access',
  refreshToken: 'old-refresh',
  accessTokenExpiresAt: nowSeconds() + seconds,
  htxCode: 'LB',
})

const keycloakAnswers = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const pageRequest = (pathname: string, auth: unknown) => ({
  auth,
  nextUrl: { pathname },
  url: `http://localhost:3000${pathname}`,
})

const expectRedirectToLogin = (response: Response) => {
  expect(response.status).toBe(307)
  expect(response.headers.get('location')).toBe('http://localhost:3000/login')
}

describe('refreshAccessToken', () => {
  it('keeps a token with more than 30 seconds left unchanged', async () => {
    const token = tokenExpiringIn(120)
    const fetchImpl = jest.fn()

    await expect(refreshAccessToken(token, fetchImpl)).resolves.toBe(token)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refreshes a token with less than 30 seconds left and updates accessToken, refreshToken, accessTokenExpiresAt, htxCode', async () => {
    const access = accessTokenWith({ htx_code: 'TC', name: 'Trưởng ~~~???>>>' })
    expect(access).toMatch(/[-_]/) // proves the payload needs base64url handling
    const fetchImpl = jest.fn().mockResolvedValue(
      keycloakAnswers({ access_token: access, refresh_token: 'new-refresh', expires_in: 300 }),
    )

    const result = await refreshAccessToken(tokenExpiringIn(10), fetchImpl)

    expect(result).toMatchObject({ accessToken: access, refreshToken: 'new-refresh', htxCode: 'TC', sub: 'user-1' })
    expect(result.accessTokenExpiresAt).toBeGreaterThanOrEqual(nowSeconds() + 299)
    expect(result.error).toBeUndefined()

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toMatch(/\/protocol\/openid-connect\/token$/)
    expect(init.method).toBe('POST')
    const body = new URLSearchParams(init.body)
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('old-refresh')
    expect(body.get('client_id')).toBeTruthy()
    expect(body.get('client_secret')).toBeTruthy()
  })

  it('keeps the existing refresh token when Keycloak returns none', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      keycloakAnswers({ access_token: accessTokenWith({ htx_code: 'TC' }), expires_in: 300 }),
    )

    const result = await refreshAccessToken(tokenExpiringIn(10), fetchImpl)

    expect(result.refreshToken).toBe('old-refresh')
  })

  it('turns an empty htx_code into null', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      keycloakAnswers({ access_token: accessTokenWith({ htx_code: '' }), expires_in: 300 }),
    )

    const result = await refreshAccessToken(tokenExpiringIn(10), fetchImpl)

    expect(result.htxCode).toBeNull()
  })

  it('sets error RefreshFailed and clears tokens when Keycloak answers 400', async () => {
    const logged = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
    const fetchImpl = jest.fn().mockResolvedValue(keycloakAnswers({ error: 'invalid_grant' }, 400))

    const result = await refreshAccessToken(tokenExpiringIn(-5), fetchImpl)

    expect(result.error).toBe('RefreshFailed')
    expect(result.accessToken).toBeUndefined()
    expect(result.refreshToken).toBeUndefined()
    expect(JSON.stringify(logged.mock.calls)).not.toMatch(/old-access|old-refresh/)
    logged.mockRestore()
  })

  it('sets error RefreshFailed for an expired token when Keycloak cannot be reached', async () => {
    const logged = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
    const fetchImpl = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED'))

    const result = await refreshAccessToken(tokenExpiringIn(-5), fetchImpl)

    expect(result.error).toBe('RefreshFailed')
    logged.mockRestore()
  })

  it('two concurrent refreshes both return a usable token', async () => {
    const logged = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
    const access = accessTokenWith({ htx_code: 'LB' })
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(keycloakAnswers({ access_token: access, refresh_token: 'new-refresh', expires_in: 300 }))
      .mockResolvedValueOnce(keycloakAnswers({ error: 'invalid_grant' }, 400))
    const token = tokenExpiringIn(10)

    const results = await Promise.all([refreshAccessToken(token, fetchImpl), refreshAccessToken(token, fetchImpl)])

    expect(results.map((result) => result.error)).toEqual([undefined, undefined])
    expect(results[0].accessToken).toBe(access)
    expect(results[1].accessToken).toBe('old-access')
    expect(results[1].refreshToken).toBe('old-refresh')
    logged.mockRestore()
  })

  it('leaves a session without a refresh token alone (dev-login and pre-upgrade cookies)', async () => {
    const token: JWT = { sub: 'dev-manager-id', role: 'manager' }
    const fetchImpl = jest.fn()

    await expect(refreshAccessToken(token, fetchImpl)).resolves.toBe(token)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('refreshAccessToken role and missing refresh token', () => {
  const refreshedWith = async (claims: Record<string, unknown>, role: JWT['role'] = 'officer') => {
    const access = accessTokenWith(claims)
    const fetchImpl = jest.fn().mockResolvedValue(keycloakAnswers({ access_token: access, expires_in: 300 }))
    return refreshAccessToken({ ...tokenExpiringIn(10), role }, fetchImpl)
  }

  it('updates the role when Keycloak changed it', async () => {
    const result = await refreshedWith({ htx_code: 'TC', realm_access: { roles: ['offline_access', 'manager'] } })
    expect(result.role).toBe('manager')
  })

  it('clears the role when the refreshed token has no recognised role', async () => {
    const result = await refreshedWith({ htx_code: 'TC', realm_access: { roles: ['offline_access'] } })
    expect(result.role).toBeUndefined()
  })

  it('clears the role when the refreshed token has no realm_access', async () => {
    const result = await refreshedWith({ htx_code: 'TC' })
    expect(result.role).toBeUndefined()
  })

  it('applies the same role order as sign-in', async () => {
    const result = await refreshedWith({ realm_access: { roles: ['farmer', 'officer'] } }, 'farmer')
    expect(result.role).toBe('officer')
  })

  describe('in production', () => {
    const env = process.env as Record<string, string | undefined>
    const original = env.NODE_ENV
    beforeEach(() => { env.NODE_ENV = 'production' })
    afterEach(() => { env.NODE_ENV = original })

    it('sends a session without a refresh token to login', async () => {
      const fetchImpl = jest.fn()
      const result = await refreshAccessToken({ sub: 'user-1', accessToken: 'stale', htxCode: 'TC' }, fetchImpl)
      expect(result.error).toBe('RefreshFailed')
      expect(result.accessToken).toBeUndefined()
      expect(fetchImpl).not.toHaveBeenCalled()
    })
  })
})

describe('auth callbacks', () => {
  it('stores the Keycloak tokens in the JWT at sign-in', async () => {
    const access = accessTokenWith({ htx_code: 'LB', realm_access: { roles: ['manager'] } })
    const expiresAt = nowSeconds() + 300

    const token = await jwtCallback({
      token: {},
      account: { access_token: access, refresh_token: 'refresh', expires_at: expiresAt, providerAccountId: 'kc-1' },
    })

    expect(token).toMatchObject({
      accessToken: access,
      refreshToken: 'refresh',
      accessTokenExpiresAt: expiresAt,
      htxCode: 'LB',
      sub: 'kc-1',
      role: 'manager',
    })
  })

  it('session callback exposes htxCode and no token field', async () => {
    const session = await sessionCallback({
      session: { user: { name: 'A' }, expires: 'later' },
      token: { ...tokenExpiringIn(120), idToken: 'id-token', role: 'manager', error: 'RefreshFailed' },
    })

    expect(session.user.htxCode).toBe('LB')
    expect(session.error).toBe('RefreshFailed')
    expect(JSON.stringify(session)).not.toMatch(/old-access|old-refresh|id-token/)
    expect(Object.keys(session).sort()).toEqual(['error', 'expires', 'user'])
  })

  it('session callback exposes a null htxCode when the token has none', async () => {
    const session = await sessionCallback({ session: { user: {}, expires: 'later' }, token: { sub: 'dev' } })

    expect(session.user.htxCode).toBeNull()
    expect(session).not.toHaveProperty('error')
  })
})

describe('middleware with a failed refresh', () => {
  const failedSession = { user: { role: 'manager' }, error: 'RefreshFailed' }

  it('middleware redirects to /login when session.error is RefreshFailed, including from a page request', () => {
    expectRedirectToLogin(handler(pageRequest('/manager/dashboard', failedSession), {}))
    expectRedirectToLogin(handler(pageRequest('/', failedSession), {}))
  })

  it('answers 401 on an API route', () => {
    expect(handler(pageRequest('/api/farm/parcels', failedSession), {}).status).toBe(401)
  })

  it('does not redirect /login itself or a public page', () => {
    expect(handler(pageRequest('/login', failedSession), {}).headers.get('location')).toBeNull()
    expect(handler(pageRequest('/lot/LOT-1', failedSession), {}).headers.get('location')).toBeNull()
  })

  it('lets a healthy session through', () => {
    const response = handler(pageRequest('/manager/dashboard', { user: { role: 'manager' } }), {})
    expect(response.headers.get('location')).toBeNull()
    expect(response.status).toBe(200)
  })
})

describe('getCoreToken', () => {
  const mockGetToken = getToken as unknown as jest.Mock

  beforeEach(() => {
    mockGetToken.mockReset()
    ;(headers as jest.Mock).mockReturnValue(new Headers({ cookie: 'x=y' }))
  })

  it('getCoreToken throws CoreUnauthorizedError when token.error is set', async () => {
    mockGetToken.mockResolvedValue({ error: 'RefreshFailed' })

    await expect(getCoreToken()).rejects.toBeInstanceOf(CoreUnauthorizedError)
  })

  it('throws CoreUnauthorizedError when there is no token', async () => {
    mockGetToken.mockResolvedValue(null)

    await expect(getCoreToken()).rejects.toBeInstanceOf(CoreUnauthorizedError)
  })

  it('throws CoreUnauthorizedError for a session without an access token', async () => {
    mockGetToken.mockResolvedValue({ sub: 'dev-manager-id', role: 'manager' })

    await expect(getCoreToken()).rejects.toBeInstanceOf(CoreUnauthorizedError)
  })

  it('returns the access token from the request headers', async () => {
    mockGetToken.mockResolvedValue(tokenExpiringIn(120))

    await expect(getCoreToken()).resolves.toBe('old-access')
    expect(mockGetToken.mock.calls[0][0].req.headers.get('cookie')).toBe('x=y')
    expect(mockGetToken.mock.calls[0][0].secureCookie).toBe(false)
  })

  it('reads the secure cookie behind an https proxy', async () => {
    ;(headers as jest.Mock).mockReturnValue(new Headers({ 'x-forwarded-proto': 'https' }))
    mockGetToken.mockResolvedValue(tokenExpiringIn(120))

    await getCoreToken()

    expect(mockGetToken.mock.calls[0][0].secureCookie).toBe(true)
  })

  it('refreshes when the request still carries the cookie from before the middleware refresh', async () => {
    const access = accessTokenWith({ htx_code: 'LB' })
    const originalFetch = global.fetch
    global.fetch = jest.fn().mockResolvedValue(keycloakAnswers({ access_token: access, expires_in: 300 }))
    mockGetToken.mockResolvedValue(tokenExpiringIn(-5))

    await expect(getCoreToken()).resolves.toBe(access)

    global.fetch = originalFetch
  })
})
