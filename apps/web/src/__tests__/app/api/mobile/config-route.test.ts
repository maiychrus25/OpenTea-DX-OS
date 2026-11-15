/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import pkg from '../../../../../package.json'
import { GET } from '@/app/api/mobile/config/route'

describe('GET /api/mobile/config', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  test('returns the public issuer the web app signs in with, the mobile client and the core version', async () => {
    process.env.KEYCLOAK_ISSUER = 'https://id.example.org/realms/agrimarket'
    process.env.KEYCLOAK_INTERNAL_URL = 'http://keycloak:8080/realms/agrimarket'

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      oidc: { issuer: 'https://id.example.org/realms/agrimarket', client_id: 'dxos-mobile', redirect_uri: 'vn.opentea.dxos.tour:/oauth2redirect' },
      core_version: pkg.version,
    })
  })

  test('falls back to the default local issuer, as the sign-in does', async () => {
    delete process.env.KEYCLOAK_ISSUER

    expect((await (await GET()).json()).oidc.issuer).toBe('http://localhost:8080/realms/agrimarket')
  })

  test('holds no secret and no internal address', async () => {
    process.env.KEYCLOAK_ISSUER = 'https://id.example.org/realms/agrimarket'
    process.env.KEYCLOAK_INTERNAL_URL = 'http://keycloak:8080/realms/agrimarket'
    process.env.KEYCLOAK_CLIENT_SECRET = 'top-secret-value'

    const text = await (await GET()).text()

    expect(text).not.toContain('top-secret-value')
    expect(text).not.toContain('keycloak:8080')
    expect(text).not.toMatch(/secret/i)
  })
})
