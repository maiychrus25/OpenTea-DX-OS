/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createSign, generateKeyPairSync } from 'node:crypto'
import { ForbiddenError, UnauthorizedError } from '@/domain/errors'
import { KeycloakUserTokenVerifier } from '@/infrastructure/auth/agent-token-verifier'

const ISSUER = 'http://keycloak:8080/realms/agrimarket'
const NOW_SEC = 1_700_000_000

function signJwt(privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'], payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'kid-1', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${body}`)
  signer.end()
  return `${header}.${body}.${signer.sign(privateKey).toString('base64url')}`
}

describe('KeycloakUserTokenVerifier', () => {
  const kp = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    json: async () => ({ keys: [{ ...kp.publicKey.export({ format: 'jwk' }), kid: 'kid-1', use: 'sig', alg: 'RS256' }] }),
  })) as unknown as typeof fetch
  const verifier = () => new KeycloakUserTokenVerifier({ jwksUrl: `${ISSUER}/certs`, expectedIssuer: ISSUER, fetchImpl, now: () => NOW_SEC * 1000 })
  const claims = (overrides: Record<string, unknown> = {}) => ({
    iss: ISSUER, sub: 'user-1', aud: 'dx-os-core', azp: 'nextjs-web', htx_code: 'TC', realm_access: { roles: ['manager'] }, exp: NOW_SEC + 3600, ...overrides,
  })

  afterEach(() => { delete process.env.KEYCLOAK_CLIENT_ID })

  it('accepts the browser session client and reads the cooperative from the token', async () => {
    expect(await verifier().verify(signJwt(kp.privateKey, claims()))).toEqual({ sub: 'user-1', azp: 'nextjs-web', htxCode: 'TC', roles: ['manager'] })
  })

  it('follows KEYCLOAK_CLIENT_ID, the variable of the NextAuth provider', async () => {
    process.env.KEYCLOAK_CLIENT_ID = 'web-two'
    await expect(verifier().verify(signJwt(kp.privateKey, claims()))).rejects.toBeInstanceOf(UnauthorizedError)
    expect((await verifier().verify(signJwt(kp.privateKey, claims({ azp: 'web-two' })))).azp).toBe('web-two')
  })

  it('refuses a forged signature, an expired token and another client with 401', async () => {
    await expect(verifier().verify(signJwt(other.privateKey, claims()))).rejects.toBeInstanceOf(UnauthorizedError)
    await expect(verifier().verify(signJwt(kp.privateKey, claims({ exp: NOW_SEC - 1 })))).rejects.toBeInstanceOf(UnauthorizedError)
    await expect(verifier().verify(signJwt(kp.privateKey, claims({ azp: 'dxos-mcp' })))).rejects.toBeInstanceOf(UnauthorizedError)
    await expect(verifier().verify(signJwt(kp.privateKey, claims({ aud: 'other' })))).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('refuses service roles and a token without a valid cooperative with 403', async () => {
    for (const role of ['agent', 'telegram', 'staff-sync', 'web-service']) {
      await expect(verifier().verify(signJwt(kp.privateKey, claims({ realm_access: { roles: ['manager', role] } })))).rejects.toBeInstanceOf(ForbiddenError)
    }
    await expect(verifier().verify(signJwt(kp.privateKey, claims({ htx_code: undefined })))).rejects.toBeInstanceOf(ForbiddenError)
    await expect(verifier().verify(signJwt(kp.privateKey, claims({ htx_code: 'bad code' })))).rejects.toBeInstanceOf(ForbiddenError)
  })
})
