// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test, expect } from '@playwright/test'

test('1.2a-E2E-001: visiting unknown route shows not-found page', async ({ page }) => {
  await page.goto('/htx/this-is-a/guaranteed-404')
  await expect(page.getByText(/không tìm thấy trang/i)).toBeVisible()
})

test('1.2a-E2E-002: not-found page has working dashboard link', async ({ page }) => {
  await page.goto('/htx/this-is-a/guaranteed-404')
  const dashboardLink = page.getByRole('link', { name: /về trang chủ/i })
  await expect(dashboardLink).toBeVisible()
})

test('1.2a-E2E-003: loading.tsx skeleton visible during suspense', async ({ page }) => {
  // Navigate to 404 page first to get a real Next.js page with a <Link>
  await page.goto('/htx/this-is-a/guaranteed-404')
  
  // Intercept Next.js RSC fetches (client-side navigation) and delay them
  await page.route('**/*?_rsc=*', async (route) => {
    await new Promise(r => setTimeout(r, 1000))
    await route.continue()
  })
  
  // Click the link to trigger client-side navigation
  await page.getByRole('link', { name: /về trang chủ/i }).click()
  
  // Skeleton should appear during the delayed RSC fetch
  await expect(page.locator('[data-testid="skeleton"]').first()).toBeVisible()
})
