// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test, expect } from '@playwright/test'

const publicLotCode = process.env.E2E_PUBLIC_LOT_CODE

test.describe('Story 0.1 route reconciliation', () => {
  test('0.1-ROUTE-001 seeded public QR route renders without authentication', async ({ browser }) => {
    test.skip(!publicLotCode, 'Set E2E_PUBLIC_LOT_CODE to a seeded QR lot before running the public-page smoke')

    const context = await browser.newContext()
    const page = await context.newPage()
    const response = await page.goto(`/lot/${publicLotCode}`)

    expect(response?.status()).toBe(200)
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('body')).toContainText(/truy xuất|traceability/i)

    await context.close()
  })

  test('0.1-ROUTE-001 invalid public QR code returns not-found without authentication redirect', async ({ browser }) => {
    test.fail(true, 'Known deviation: dynamic QR not-found currently renders a 200 loading shell; hardening is tracked by 0-3-production-deviation-hardening')
    const context = await browser.newContext()
    const page = await context.newPage()
    const response = await page.goto('/lot/INVALID-STORY-0-1-CODE')

    expect(response?.status()).toBe(404)
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.locator('body')).toContainText(/404|not found|không tìm thấy/i)

    await context.close()
  })

  test('0.1-ROUTE-001 unauthenticated protected route redirects to login', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto('/manager/profile')
    await expect(page).toHaveURL(/\/login/)

    await context.close()
  })
})
