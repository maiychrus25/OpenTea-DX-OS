// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto'

/** Test-only: a locally generated RSA key, its JWKS, and a signer for Keycloak-shaped access tokens. */
export const ISSUER = 'http://keycloak.test/realms/agrimarket'

export function makeKey(kid: string) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return { kid, privateKey, publicKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' } }
}

export type TestKey = ReturnType<typeof makeKey>

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

export function baseClaims(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000)
  return {
    iss: ISSUER,
    sub: 'user-1',
    azp: 'dxos-mobile',
    aud: ['dx-os-core', 'account'],
    exp: now + 300,
    iat: now,
    name: 'Nguyen Van A',
    htx_code: 'TC',
    realm_access: { roles: ['farmer', 'default-roles-agrimarket'] },
    ...overrides,
  }
}

export function signToken(key: { kid: string; privateKey: KeyObject }, claims: Record<string, unknown>, header: Record<string, unknown> = {}) {
  const head = b64({ alg: 'RS256', typ: 'JWT', kid: key.kid, ...header })
  const body = b64(claims)
  const signature = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key.privateKey).toString('base64url')
  return `${head}.${body}.${signature}`
}

export const jwksResponse = (...keys: TestKey[]) => new Response(JSON.stringify({ keys: keys.map((k) => k.jwk) }), { status: 200 })
