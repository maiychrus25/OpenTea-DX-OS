/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// eslint-disable-next-line no-var
var mockCaptured: any
jest.mock('next-auth', () => ({
  __esModule: true,
  default: (config: unknown) => {
    mockCaptured = config
    return { handlers: {}, signIn: jest.fn(), signOut: jest.fn(), auth: jest.fn(), unstable_update: jest.fn() }
  },
}))

import '@/auth'
import { refreshAccessToken } from '@/lib/auth/token-refresh'

function jwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode(claims)}.sig`
}

const accessWith = (roles: string[]) => jwt({ htx_code: 'TC', realm_access: { roles } })

function refreshResponse(roles: string[]): typeof fetch {
  return jest.fn(async () => ({
    ok: true,
    json: async () => ({ access_token: accessWith(roles), refresh_token: 'r2', expires_in: 300 }),
  })) as unknown as typeof fetch
}

const expired = { refreshToken: 'r1', accessTokenExpiresAt: 1 }

describe('sign-in', () => {
  test('stores every role and the default active role', async () => {
    const out = await mockCaptured.callbacks.jwt({
      token: {},
      profile: { realm_access: { roles: ['farmer', 'officer', 'agent'] } },
      account: { access_token: accessWith(['farmer', 'officer']), refresh_token: 'r', expires_at: 9999999999 },
    })
    expect(out.roles).toEqual(['officer', 'farmer'])
    expect(out.role).toBe('officer')
  })
})

describe('session callback', () => {
  const run = (token: Record<string, unknown>) => mockCaptured.callbacks.session({ session: { user: {} }, token })

  test('legacy session without roles keeps working', async () => {
    const session = await run({ sub: 'u1', role: 'manager', htxCode: 'TC' })
    expect(session.user.role).toBe('manager')
    expect(session.user.roles).toEqual(['manager'])
  })

  test('an active role outside the token roles falls back to the default', async () => {
    const session = await run({ sub: 'u1', role: 'manager', roles: ['farmer', 'officer'] })
    expect(session.user.role).toBe('officer')
    expect(session.user.roles).toEqual(['farmer', 'officer'])
  })
})

describe('jwt update trigger', () => {
  const update = (token: Record<string, unknown>, role: unknown) =>
    mockCaptured.callbacks.jwt({ token, trigger: 'update', session: { role } })

  test('switches to a role the token holds', async () => {
    const out = await update({ role: 'manager', roles: ['manager', 'farmer'], accessTokenExpiresAt: 9999999999, refreshToken: 'r' }, 'farmer')
    expect(out.role).toBe('farmer')
  })

  test('ignores a role the token does not hold', async () => {
    const out = await update({ role: 'farmer', roles: ['farmer'], accessTokenExpiresAt: 9999999999, refreshToken: 'r' }, 'manager')
    expect(out.role).toBe('farmer')
    expect(out.roles).toEqual(['farmer'])
  })

  test('a legacy token can only switch to its own role', async () => {
    const out = await update({ role: 'farmer', accessTokenExpiresAt: 9999999999, refreshToken: 'r' }, 'platform_admin')
    expect(out.role).toBe('farmer')
  })
})

describe('refresh keeps a valid active role and falls back when revoked', () => {
  test('keeps the active role while it is still held', async () => {
    const out = await refreshAccessToken({ ...expired, role: 'farmer', roles: ['manager', 'farmer'] } as any, refreshResponse(['manager', 'farmer']))
    expect(out.role).toBe('farmer')
    expect(out.roles).toEqual(['manager', 'farmer'])
  })

  test('falls back to the default role when the active role was revoked', async () => {
    const out = await refreshAccessToken({ ...expired, role: 'manager', roles: ['manager', 'farmer'] } as any, refreshResponse(['farmer']))
    expect(out.role).toBe('farmer')
    expect(out.roles).toEqual(['farmer'])
    expect(out.error).toBeUndefined()
  })

  test('a legacy token gains roles on refresh and keeps its role', async () => {
    const out = await refreshAccessToken({ ...expired, role: 'farmer' } as any, refreshResponse(['manager', 'farmer']))
    expect(out.role).toBe('farmer')
    expect(out.roles).toEqual(['manager', 'farmer'])
  })
})
