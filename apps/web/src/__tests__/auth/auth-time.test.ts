/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// eslint-disable-next-line no-var
var mockCaptured: any
jest.mock('next-auth', () => ({
  __esModule: true,
  default: (config: unknown) => {
    mockCaptured = config
    return { handlers: {}, signIn: jest.fn(), signOut: jest.fn(), auth: jest.fn() }
  },
}))

import '@/auth'
import { readAuthTime } from '@/lib/auth/token-refresh'

function jwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode(claims)}.sig`
}

describe('auth_time carried into the session (autonomous mode re-login)', () => {
  test('readAuthTime reads the claim and ignores anything else', () => {
    expect(readAuthTime(jwt({ auth_time: 1_700_000_000 }))).toBe(1_700_000_000)
    expect(readAuthTime(jwt({}))).toBeUndefined()
    expect(readAuthTime(jwt({ auth_time: '1700000000' }))).toBeUndefined()
    expect(readAuthTime('not-a-token')).toBeUndefined()
    expect(readAuthTime(undefined)).toBeUndefined()
  })

  test('sign-in puts the id token auth_time into the token, and the session shows it', async () => {
    const token = await mockCaptured.callbacks.jwt({
      token: { sub: 'x' },
      profile: undefined,
      account: {
        providerAccountId: 'kc-user',
        access_token: jwt({ htx_code: 'TC', realm_access: { roles: ['manager'] }, auth_time: 100 }),
        id_token: jwt({ auth_time: 1_700_000_123 }),
        refresh_token: 'r',
        expires_at: 9_999_999_999,
      },
    })
    expect(token).toMatchObject({ sub: 'kc-user', htxCode: 'TC', role: 'manager', authTime: 1_700_000_123 })

    const session = await mockCaptured.callbacks.session({ session: { user: {} }, token })
    expect(session.authTime).toBe(1_700_000_123)
  })

  test('without an id token the access token claim is used', async () => {
    const token = await mockCaptured.callbacks.jwt({
      token: {},
      account: { providerAccountId: 'u', access_token: jwt({ htx_code: 'TC', realm_access: { roles: ['manager'] }, auth_time: 555 }), expires_at: 9_999_999_999 },
    })
    expect(token.authTime).toBe(555)
  })

  test('a later refresh keeps the original auth_time', async () => {
    const now = Math.floor(Date.now() / 1000)
    const token = await mockCaptured.callbacks.jwt({
      token: { sub: 'u', authTime: 42, accessToken: 'a', refreshToken: 'r', accessTokenExpiresAt: now + 3600 },
    })
    expect(token.authTime).toBe(42)
  })

  test('a session without auth_time exposes none, so the route asks for a fresh login', async () => {
    const session = await mockCaptured.callbacks.session({ session: { user: {} }, token: {} })
    expect(session.authTime).toBeUndefined()
  })
})
