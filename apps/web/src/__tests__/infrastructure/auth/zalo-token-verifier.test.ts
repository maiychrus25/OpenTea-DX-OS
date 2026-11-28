/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createSign, generateKeyPairSync } from 'node:crypto'
import { ForbiddenError } from '@/domain/errors'
import { KeycloakUserTokenVerifier, KeycloakZaloTokenVerifier } from '@/infrastructure/auth/agent-token-verifier'

const ISSUER = 'http://keycloak:8080/realms/agrimarket'
const NOW_SEC = 1_700_000_000
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })

function sign(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${body}`)
  return `${header}.${body}.${signer.sign(privateKey).toString('base64url')}`
}

const options = () => {
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }
  return {
    jwksUrl: `${ISSUER}/protocol/openid-connect/certs`,
    expectedIssuer: ISSUER,
    fetchImpl: jest.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })) as unknown as typeof fetch,
    now: () => NOW_SEC * 1000,
  }
}
const base = { iss: ISSUER, aud: 'dx-os-core', sub: 'sa-zalo', exp: NOW_SEC + 600, nbf: NOW_SEC - 10 }

describe('KeycloakZaloTokenVerifier', () => {
  const verifier = () => new KeycloakZaloTokenVerifier(options())

  it('accepts the dxos-zalo service account with the zalo role', async () => {
    const token = sign({ ...base, azp: 'dxos-zalo', realm_access: { roles: ['zalo'] } })
    await expect(verifier().verify(token)).resolves.toEqual({ sub: 'sa-zalo', azp: 'dxos-zalo', roles: ['zalo'] })
  })

  it('refuses a telegram token, an agent token and a zalo-role token from another client', async () => {
    for (const claims of [
      { azp: 'dxos-telegram', realm_access: { roles: ['telegram'] } },
      { azp: 'dxos-agent-tc', htx_code: 'TC', realm_access: { roles: ['agent'] } },
      { azp: 'dxos-web-roles', realm_access: { roles: ['zalo'] } },
      { azp: 'dxos-zalo', realm_access: { roles: [] } },
    ]) {
      await expect(verifier().verify(sign({ ...base, ...claims }))).rejects.toThrow(ForbiddenError)
    }
  })

  it('a person token with the zalo role is not a user token either', async () => {
    const user = new KeycloakUserTokenVerifier({ ...options(), expectedAzp: 'nextjs-web' })
    await expect(user.verify(sign({ ...base, azp: 'nextjs-web', htx_code: 'TC', realm_access: { roles: ['manager', 'zalo'] } }))).rejects.toThrow(ForbiddenError)
  })
})
