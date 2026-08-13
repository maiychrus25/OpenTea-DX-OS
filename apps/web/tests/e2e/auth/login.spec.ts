// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test, expect } from '@playwright/test'

test('1.5a-E2E-001: login page renders at /login without auth', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByText('DX-AgriMarket')).toBeVisible()
  await expect(page.getByRole('button')).toBeVisible()
})

test('1.5a-E2E-002: clicking login redirects to Keycloak', async ({ page }) => {
  await page.goto('/login')
  await page.click('button')
  // Should redirect to Keycloak auth endpoint
  await expect(page).toHaveURL(/keycloak|localhost:8080|api\/auth\/signin/)
})

test('1.5a-E2E-003: page is mobile responsive (400px card)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/login')
  const card = page.locator('[class*="card"]')
  const cardWidth = await card.evaluate((el) => el.getBoundingClientRect().width)
  expect(cardWidth).toBeLessThanOrEqual(375)
})
