// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Real Keycloak login for specs that run against the stack (E2E_CORE=1, E2E_BASE_URL=http://localhost:3000).
import type { Page } from '@playwright/test'

/** smoke_ users get this password from `make platform-smoke`; demo users (prisma seed + realm) use DEMO_PASSWORD. */
export const SMOKE_PASSWORD = 'Smoke-Pass-1'
export const DEMO_PASSWORD = 'Test1234!'

/** Logs in through the Keycloak form and waits for the role's dashboard. */
export async function keycloakLogin(page: Page, username: string, password: string, role: 'farmer' | 'officer' | 'manager') {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Tiếp tục với Keycloak' }).click()
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.locator('#kc-login').click()
  await page.waitForURL(`**/${role}/dashboard`)
}
