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

import { execFileSync } from 'node:child_process'
import NextAuth from 'next-auth'
import '@/auth'

// Auth.js splits the session cookie above this many characters (4096 minus its estimate of the attributes).
const AUTHJS_CHUNK_SIZE = 4096 - 160

const { jwt: jwtCallback } = (NextAuth as unknown as jest.Mock).mock.calls[0][0].callbacks

/** The real Auth.js encoder; it is ESM-only, so it runs in a plain Node process rather than through Jest's transform. */
function encodeLikeAuthJs(token: Record<string, unknown>): string {
  const script = `require('next-auth/jwt').encode({ token: JSON.parse(require('fs').readFileSync(0, 'utf8')),
    secret: 'size-test-secret-0123456789abcdef', salt: 'authjs.session-token' }).then((v) => process.stdout.write(v))`
  return execFileSync(process.execPath, ['-e', script], { input: JSON.stringify(token), cwd: process.cwd() }).toString()
}

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
const rs256Signature = 'S'.repeat(342)
const jws = (claims: Record<string, unknown>, signature = rs256Signature) =>
  `${base64url({ alg: 'RS256', typ: 'JWT', kid: 'k'.repeat(43) })}.${base64url(claims)}.${signature}`

// Claims shaped like a Keycloak 24 token of the agrimarket realm, with a long Vietnamese name.
const name = 'Nguyễn Thị Phương Thảo Hoàng'
const email = 'nguyen.thi.phuong.thao.hoang@htx-che-tan-cuong.vn'
const now = Math.floor(Date.now() / 1000)
const common = {
  exp: now + 300,
  iat: now,
  auth_time: now,
  jti: 'onrtac:0b6f7c2e-3a9d-4c1e-9f7a-2d8e5b4c3a21',
  iss: 'https://sso.htx-che-tan-cuong.vn/realms/agrimarket',
  sub: '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
  azp: 'nextjs-web',
  sid: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
}
const accessToken = jws({
  ...common,
  aud: 'account',
  typ: 'Bearer',
  acr: '1',
  'allowed-origins': ['https://htx-che-tan-cuong.vn'],
  realm_access: { roles: ['offline_access', 'default-roles-agrimarket', 'uma_authorization', 'manager'] },
  resource_access: { account: { roles: ['manage-account', 'manage-account-links', 'view-profile'] } },
  scope: 'openid profile email',
  email_verified: true,
  htx_code: 'TC',
  name,
  preferred_username: 'nguyen.thi.phuong.thao.hoang',
  given_name: 'Phương Thảo Hoàng',
  family_name: 'Nguyễn Thị',
  email,
})
const refreshToken = jws(
  { ...common, aud: 'https://sso.htx-che-tan-cuong.vn/realms/agrimarket', typ: 'Refresh', scope: 'openid profile email roles web-origins acr basic' },
  'H'.repeat(86)
)
const idToken = jws({ ...common, aud: 'nextjs-web', typ: 'ID', at_hash: 'a'.repeat(22), name, email })

describe('session cookie size (#75)', () => {
  it('uses tokens at least as large as the ones measured in CI', () => {
    // CI 2026-11-25: access 1482, refresh 706 characters.
    expect(accessToken.length).toBeGreaterThan(1482)
    expect(refreshToken.length).toBeGreaterThan(706)
  })

  it('a signed-in session fits in one cookie, so concurrent responses cannot mix its chunks', async () => {
    const token = await jwtCallback({
      token: { name, email, picture: null, sub: common.sub },
      account: { id_token: idToken, access_token: accessToken, refresh_token: refreshToken, expires_at: common.exp, providerAccountId: common.sub },
      profile: { realm_access: { roles: ['manager'] } },
    })

    const cookie = encodeLikeAuthJs(token)

    expect(cookie.length).toBeLessThanOrEqual(AUTHJS_CHUNK_SIZE)
  })
})
