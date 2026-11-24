/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createSign, generateKeyPairSync } from 'node:crypto'
import { ForbiddenError } from '@/domain/errors'
import { KeycloakTelegramTokenVerifier } from '@/infrastructure/auth/agent-token-verifier'
import { parseEnvFile, KeycloakLiveRoleReader } from '@/infrastructure/auth/dxos-web-roles.client'

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

function verifierFor() {
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }
  const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }))
  return new KeycloakTelegramTokenVerifier({
    jwksUrl: `${ISSUER}/protocol/openid-connect/certs`,
    expectedIssuer: ISSUER,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now: () => NOW_SEC * 1000,
  })
}

const base = {
  iss: ISSUER, aud: 'dx-os-core', sub: 'sa-telegram', exp: NOW_SEC + 600, nbf: NOW_SEC - 10,
}

describe('KeycloakTelegramTokenVerifier', () => {
  test('accepts the dxos-telegram service account with the telegram role', async () => {
    const token = sign({ ...base, azp: 'dxos-telegram', realm_access: { roles: ['telegram'] } })
    await expect(verifierFor().verify(token)).resolves.toEqual({ sub: 'sa-telegram', azp: 'dxos-telegram', roles: ['telegram'] })
  })

  test('refuses an agent token, and a telegram-role token from another client', async () => {
    const agentToken = sign({ ...base, azp: 'dxos-agent-tc', htx_code: 'TC', realm_access: { roles: ['agent'] } })
    await expect(verifierFor().verify(agentToken)).rejects.toThrow(ForbiddenError)

    const otherClient = sign({ ...base, azp: 'dxos-web-roles', realm_access: { roles: ['telegram'] } })
    await expect(verifierFor().verify(otherClient)).rejects.toThrow(ForbiddenError)
  })
})

describe('live role reader', () => {
  test('parses KEY=VALUE lines written by the enable command', () => {
    expect(parseEnvFile('DXOS_ROLES_CLIENT_ID=dxos-web-roles\nDXOS_ROLES_CLIENT_SECRET=s3cr3t\n')).toEqual({
      DXOS_ROLES_CLIENT_ID: 'dxos-web-roles',
      DXOS_ROLES_CLIENT_SECRET: 's3cr3t',
    })
  })

  test('reads enabled flag, cooperative attribute and realm roles with the service account', async () => {
    const calls: string[] = []
    const fetchImpl = jest.fn(async (url: string) => {
      calls.push(url)
      if (url.endsWith('/protocol/openid-connect/token')) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 300 }), { status: 200 })
      }
      if (url.endsWith('/role-mappings/realm')) {
        return new Response(JSON.stringify([{ name: 'manager' }]), { status: 200 })
      }
      return new Response(JSON.stringify({ enabled: true, attributes: { htx_code: ['TC'] } }), { status: 200 })
    })
    const reader = new KeycloakLiveRoleReader(
      fetchImpl as unknown as typeof fetch,
      () => 0,
      async () => 'DXOS_ROLES_CLIENT_ID=dxos-web-roles\nDXOS_ROLES_CLIENT_SECRET=s3cr3t\n'
    )

    await expect(reader.read('user-1')).resolves.toEqual({ roles: ['manager'], enabled: true, htxCode: 'TC' })
    expect(calls[1]).toBe('http://keycloak:8080/admin/realms/agrimarket/users/user-1')
  })
})
