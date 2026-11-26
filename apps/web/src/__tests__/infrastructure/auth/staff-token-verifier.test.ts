/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createSign, generateKeyPairSync } from 'node:crypto'
import { ForbiddenError } from '@/domain/errors'
import { KeycloakStaffTokenVerifier } from '@/infrastructure/auth/agent-token-verifier'

const ISSUER = 'http://keycloak:8080/realms/agrimarket'
const nowSec = 1_700_000_000
const kp = generateKeyPairSync('rsa', { modulusLength: 2048 })

function sign(payload: Record<string, unknown>): string {
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })).toString('base64url')
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signer = createSign('RSA-SHA256')
  signer.update(`${h}.${p}`)
  signer.end()
  return `${h}.${p}.${signer.sign(kp.privateKey).toString('base64url')}`
}

function verifier() {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    json: async () => ({ keys: [{ ...kp.publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }] }),
  })) as unknown as typeof fetch
  return new KeycloakStaffTokenVerifier({ jwksUrl: `${ISSUER}/certs`, expectedIssuer: ISSUER, fetchImpl, now: () => nowSec * 1000 })
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    iss: ISSUER,
    sub: 'sa-1',
    aud: 'dx-os-core',
    azp: 'dxos-staff-tc',
    htx_code: 'TC',
    realm_access: { roles: ['staff-sync'] },
    exp: nowSec + 3600,
    ...overrides,
  }
}

describe('KeycloakStaffTokenVerifier', () => {
  test('accepts a dxos-staff-<htx> token with the staff-sync role and returns its cooperative', async () => {
    await expect(verifier().verify(sign(payload()))).resolves.toEqual({
      sub: 'sa-1',
      azp: 'dxos-staff-tc',
      htxCode: 'TC',
      roles: ['staff-sync'],
    })
  })

  test.each([
    ['the agent role instead of staff-sync', { realm_access: { roles: ['agent'] } }],
    ['no roles', { realm_access: undefined }],
    ['an agent client id', { azp: 'dxos-agent-tc' }],
    ['a client id of another cooperative', { azp: 'dxos-staff-lb' }],
    ['an azp that does not match the pattern', { azp: 'dxos-staff-TC!' }],
    ['no htx_code claim', { htx_code: undefined }],
    ['a malformed htx_code claim', { htx_code: 'tc/../x' }],
  ])('rejects %s', async (_name, overrides) => {
    await expect(verifier().verify(sign(payload(overrides)))).rejects.toBeInstanceOf(ForbiddenError)
  })
})
