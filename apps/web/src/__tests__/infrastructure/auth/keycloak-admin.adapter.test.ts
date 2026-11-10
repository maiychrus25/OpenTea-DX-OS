/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'

const NAMES = ['KC_BOOTSTRAP_ADMIN_USERNAME', 'KC_BOOTSTRAP_ADMIN_PASSWORD', 'KEYCLOAK_ADMIN', 'KEYCLOAK_ADMIN_PASSWORD', 'NODE_ENV'] as const
const env = process.env as Record<string, string | undefined>
const original = Object.fromEntries(NAMES.map((name) => [name, env[name]]))

const fetchMock = jest.fn()
beforeEach(() => {
  for (const name of NAMES.slice(0, 4)) delete env[name]
  env.NODE_ENV = 'test'
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  fetchMock.mockReset().mockResolvedValue({ ok: false, status: 401, text: async () => 'no' })
  global.fetch = fetchMock as unknown as typeof fetch
})
afterAll(() => Object.assign(env, original))

// The token request is the only use of the credentials; a refused login leaves the module cache empty.
async function usedCredentials() {
  await new KeycloakAdminAdapter().getUserHtxCode('u1').catch(() => undefined)
  const body = new URLSearchParams(fetchMock.mock.calls[0][1].body)
  return [body.get('username'), body.get('password')]
}

test('reads KC_BOOTSTRAP_ADMIN_* first', async () => {
  env.KC_BOOTSTRAP_ADMIN_USERNAME = 'boot'
  env.KC_BOOTSTRAP_ADMIN_PASSWORD = 'boot-pass'
  env.KEYCLOAK_ADMIN = 'kc'
  env.KEYCLOAK_ADMIN_PASSWORD = 'kc-pass'
  await expect(usedCredentials()).resolves.toEqual(['boot', 'boot-pass'])
})

test('falls back to KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD', async () => {
  env.KEYCLOAK_ADMIN = 'kc'
  env.KEYCLOAK_ADMIN_PASSWORD = 'kc-pass'
  await expect(usedCredentials()).resolves.toEqual(['kc', 'kc-pass'])
})

test('uses admin/admin outside production when nothing is set', async () => {
  await expect(usedCredentials()).resolves.toEqual(['admin', 'admin'])
})

test('refuses to run in production when no credentials are set', () => {
  env.NODE_ENV = 'production'
  expect(() => new KeycloakAdminAdapter()).toThrow(/KEYCLOAK_ADMIN/)
})

test('refuses to run in production with only a user name set', () => {
  env.NODE_ENV = 'production'
  env.KEYCLOAK_ADMIN = 'kc'
  expect(() => new KeycloakAdminAdapter()).toThrow(/KEYCLOAK_ADMIN/)
})

test('works in production with KEYCLOAK_ADMIN credentials', async () => {
  env.NODE_ENV = 'production'
  env.KEYCLOAK_ADMIN = 'kc'
  env.KEYCLOAK_ADMIN_PASSWORD = 'kc-pass'
  await expect(usedCredentials()).resolves.toEqual(['kc', 'kc-pass'])
})
