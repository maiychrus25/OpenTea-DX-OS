/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createSign, generateKeyPairSync } from 'node:crypto'
import { ForbiddenError, UnauthorizedError } from '@/domain/errors'
import { KeycloakAgentTokenVerifier } from '@/infrastructure/auth/agent-token-verifier'

const ISSUER = 'http://keycloak:8080/realms/agrimarket'
const JWKS_URL = `${ISSUER}/protocol/openid-connect/certs`

function toJwk(publicKey: ReturnType<typeof generateKeyPairSync>['publicKey'], kid: string) {
  return {
    ...publicKey.export({ format: 'jwk' }),
    kid,
    use: 'sig',
    alg: 'RS256',
  }
}

function signJwt(
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
  header: Record<string, unknown>,
  payload: Record<string, unknown>
): string {
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signingInput = `${headerB64}.${payloadB64}`
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  const sigB64 = signer.sign(privateKey).toString('base64url')
  return `${signingInput}.${sigB64}`
}

describe('KeycloakAgentTokenVerifier', () => {
  const kp1 = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const kp2 = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const nowSec = 1_700_000_000

  function basePayload(overrides: Record<string, unknown> = {}) {
    return {
      iss: ISSUER,
      sub: 'sa-uuid-1',
      aud: 'dx-os-core',
      azp: 'dxos-agent-tc',
      htx_code: 'TC',
      realm_access: { roles: ['agent'] },
      exp: nowSec + 3600,
      nbf: nowSec - 10,
      ...overrides,
    }
  }

  test('verifies a valid RS256 agent token and caches JWKS for 10 minutes', async () => {
    let clock = nowSec * 1000
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ keys: [toJwk(kp1.publicKey, 'kid-1')] }),
    })) as unknown as typeof fetch

    const verifier = new KeycloakAgentTokenVerifier({
      jwksUrl: JWKS_URL,
      expectedIssuer: ISSUER,
      fetchImpl: fetchMock,
      now: () => clock,
    })

    const token = signJwt(kp1.privateKey, { alg: 'RS256', kid: 'kid-1', typ: 'JWT' }, basePayload())
    const first = await verifier.verify(token)
    expect(first).toEqual({
      sub: 'sa-uuid-1',
      azp: 'dxos-agent-tc',
      htxCode: 'TC',
      roles: ['agent'],
    })

    clock += 9 * 60 * 1000
    await verifier.verify(token)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    clock += 2 * 60 * 1000
    await verifier.verify(token)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('refetches JWKS once on unknown kid to pick up rotated keys, then rejects unknown kid', async () => {
    let rotate = false
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        keys: rotate ? [toJwk(kp2.publicKey, 'kid-2')] : [toJwk(kp1.publicKey, 'kid-1')],
      }),
    })) as unknown as typeof fetch

    const verifier = new KeycloakAgentTokenVerifier({
      jwksUrl: JWKS_URL,
      expectedIssuer: ISSUER,
      fetchImpl: fetchMock,
      now: () => nowSec * 1000,
    })

    await verifier.verify(signJwt(kp1.privateKey, { alg: 'RS256', kid: 'kid-1' }, basePayload()))
    rotate = true

    const rotated = signJwt(
      kp2.privateKey,
      { alg: 'RS256', kid: 'kid-2' },
      basePayload({ aud: ['account', 'dx-os-core'] })
    )
    await expect(verifier.verify(rotated)).resolves.toMatchObject({ htxCode: 'TC' })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const missingKid = signJwt(kp2.privateKey, { alg: 'RS256', kid: 'kid-missing' }, basePayload())
    await expect(verifier.verify(missingKid)).rejects.toThrow(UnauthorizedError)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  test('rejects tampered signature, wrong alg, expired exp, wrong iss and wrong aud with UnauthorizedError', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ keys: [toJwk(kp1.publicKey, 'kid-1')] }),
    })) as unknown as typeof fetch

    const verifier = new KeycloakAgentTokenVerifier({
      jwksUrl: JWKS_URL,
      expectedIssuer: ISSUER,
      fetchImpl: fetchMock,
      now: () => nowSec * 1000,
    })

    const valid = signJwt(kp1.privateKey, { alg: 'RS256', kid: 'kid-1' }, basePayload())
    const [h, p, s] = valid.split('.')
    const tampered = `${h}.${p}.${s.slice(0, -2)}aa`
    await expect(verifier.verify(tampered)).rejects.toThrow(UnauthorizedError)

    await expect(
      verifier.verify(signJwt(kp1.privateKey, { alg: 'HS256', kid: 'kid-1' }, basePayload()))
    ).rejects.toThrow(UnauthorizedError)

    await expect(
      verifier.verify(signJwt(kp1.privateKey, { alg: 'RS256', kid: 'kid-1' }, basePayload({ exp: nowSec - 1 })))
    ).rejects.toThrow(UnauthorizedError)

    await expect(
      verifier.verify(
        signJwt(kp1.privateKey, { alg: 'RS256', kid: 'kid-1' }, basePayload({ nbf: nowSec + 60 }))
      )
    ).rejects.toThrow(UnauthorizedError)

    await expect(
      verifier.verify(
        signJwt(kp1.privateKey, { alg: 'RS256', kid: 'kid-1' }, basePayload({ iss: 'https://evil.example' }))
      )
    ).rejects.toThrow(UnauthorizedError)

    await expect(
      verifier.verify(
        signJwt(kp1.privateKey, { alg: 'RS256', kid: 'kid-1' }, basePayload({ aud: 'some-other-api' }))
      )
    ).rejects.toThrow(UnauthorizedError)
  })

  test('rejects non-agent role, missing htx_code or mismatched azp with ForbiddenError', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ keys: [toJwk(kp1.publicKey, 'kid-1')] }),
    })) as unknown as typeof fetch

    const verifier = new KeycloakAgentTokenVerifier({
      jwksUrl: JWKS_URL,
      expectedIssuer: ISSUER,
      fetchImpl: fetchMock,
      now: () => nowSec * 1000,
    })

    await expect(
      verifier.verify(
        signJwt(kp1.privateKey, { alg: 'RS256', kid: 'kid-1' }, basePayload({ realm_access: { roles: ['manager'] } }))
      )
    ).rejects.toThrow(ForbiddenError)

    await expect(
      verifier.verify(
        signJwt(kp1.privateKey, { alg: 'RS256', kid: 'kid-1' }, basePayload({ htx_code: undefined }))
      )
    ).rejects.toThrow(ForbiddenError)

    await expect(
      verifier.verify(
        signJwt(kp1.privateKey, { alg: 'RS256', kid: 'kid-1' }, basePayload({ azp: 'dxos-agent-lb' }))
      )
    ).rejects.toThrow(ForbiddenError)
  })
})
