/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createSign, generateKeyPairSync } from 'node:crypto'
import { UnauthorizedError } from '@/domain/errors'
import { KeycloakMcpTokenVerifier } from '@/infrastructure/auth/agent-token-verifier'

const ISSUER = 'http://keycloak:8080/realms/agrimarket'
const JWKS_URL = `${ISSUER}/protocol/openid-connect/certs`
const NOW_SEC = 1_700_000_000

type KeyPair = ReturnType<typeof generateKeyPairSync>

function signJwt(privateKey: KeyPair['privateKey'], payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'kid-1', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${body}`)
  signer.end()
  return `${header}.${body}.${signer.sign(privateKey).toString('base64url')}`
}

describe('KeycloakMcpTokenVerifier', () => {
  const kp = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    json: async () => ({ keys: [{ ...kp.publicKey.export({ format: 'jwk' }), kid: 'kid-1', use: 'sig', alg: 'RS256' }] }),
  })) as unknown as typeof fetch

  function verifier() {
    return new KeycloakMcpTokenVerifier({ jwksUrl: JWKS_URL, expectedIssuer: ISSUER, fetchImpl, now: () => NOW_SEC * 1000 })
  }

  function claims(overrides: Record<string, unknown> = {}) {
    return {
      iss: ISSUER,
      sub: 'user-uuid-1',
      aud: 'dx-os-core',
      azp: 'dxos-mcp',
      realm_access: { roles: ['manager'] },
      exp: NOW_SEC + 3600,
      ...overrides,
    }
  }

  it('accepts a valid token issued to the dxos-mcp client', async () => {
    const result = await verifier().verify(signJwt(kp.privateKey, claims()))
    expect(result).toEqual({ sub: 'user-uuid-1', azp: 'dxos-mcp', roles: ['manager'] })
  })

  it('refuses an expired token with 401', async () => {
    await expect(verifier().verify(signJwt(kp.privateKey, claims({ exp: NOW_SEC - 1 })))).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('refuses a token issued to another client with 401', async () => {
    await expect(
      verifier().verify(signJwt(kp.privateKey, claims({ azp: 'dxos-agent-tc' })))
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })
})
