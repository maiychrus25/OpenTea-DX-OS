// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// A forged Auth.js session cookie for specs that mock the API routes. It works only against the Playwright dev server,
// which gets AUTH_SECRET from playwright.config.ts. It carries no Keycloak tokens, so routes that call the core gateway
// need a mock or the real login of tests/e2e/tenant/core-tenant.spec.ts.
import type { BrowserContext, Page } from '@playwright/test'
import { encode } from 'next-auth/jwt'

const EIGHT_HOURS = 60 * 60 * 8

export async function mockSessionCookie(target: Page | BrowserContext, role: string, name = `${role} User`, id = `${role}-user-id`) {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set: run the specs through playwright.config.ts')
  const now = Math.floor(Date.now() / 1000)
  const token = await encode({
    // htxCode must exist in htx_profiles (seed or smoke fixture), or the role layouts show the NO_HTX notice.
    token: { id, sub: id, name, email: `${role}@example.com`, role, htxCode: 'TC', iat: now, exp: now + EIGHT_HOURS, jti: `mock-${role}-${now}` },
    secret,
    salt: 'authjs.session-token',
  })
  const context = 'context' in target ? target.context() : target
  await context.addCookies([{
    name: 'authjs.session-token', value: token, domain: 'localhost', path: '/',
    httpOnly: true, sameSite: 'Lax', expires: now + EIGHT_HOURS,
  }])
}
