// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test, expect, Page } from '@playwright/test'
import { mockSessionCookie } from './helpers/forged-session'

async function loginAsOfficer(page: Page) {
  await mockSessionCookie(page, 'officer', 'Officer User', 'officer-id-1')
}

async function loginAsFarmer(page: Page) {
  await mockSessionCookie(page, 'farmer', 'Farmer User', 'farmer-id-1')
}

test.describe('Story 7.8: Officer & Farmer Dashboard Today Views', () => {

  test('TC-7.8-01: officer dashboard shows hero with amber pill', async ({ page }) => {
    await loginAsOfficer(page)
    await page.goto('/officer/dashboard')
    await expect(page.getByText(/Chào buổi/)).toBeVisible()
    await expect(page.getByText(/việc cần ưu tiên/)).toBeVisible()
  })

  test('TC-7.8-02: farmer dashboard has Ghi nhật ký and Chẩn đoán bệnh buttons', async ({ page }) => {
    await loginAsFarmer(page)
    await page.goto('/farmer/dashboard')
    await expect(page.getByRole('link', { name: /Ghi nhật ký/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Chẩn đoán/ })).toBeVisible()
  })

  test('TC-7.8-03: officer sidebar has 8 nav items', async ({ page }) => {
    await loginAsOfficer(page)
    await page.goto('/officer/dashboard')
    const navItems = page.locator('[data-testid="sidebar"] nav a, [data-testid="sidebar"] nav button, aside nav a, aside nav button')
    // We expect at least 8 items (may include logout button)
    // The exact test says 8 nav items, we'll check >= 8 to be safe or exact 8 if logout is not in nav.
    // Let's assert count >= 8 to be more robust, or exact 8 + 1 logout = 9.
    // The test plan asserts exactly 8.
    await expect(navItems).toHaveCount(8)
  })

  test('TC-7.8-04: farmer bottom nav has 4 items', async ({ page }) => {
    await loginAsFarmer(page)
    await page.goto('/farmer/dashboard')
    const navItems = page.locator('[data-testid="bottom-nav"] a').filter({ hasText: /Tổng quan|Nhật ký|Chẩn đoán|Thửa/ })
    await expect(navItems).toHaveCount(4)
  })

  test('TC-7.8-05: officer cannot access farmer dashboard', async ({ page }) => {
    await loginAsOfficer(page)
    await page.goto('/farmer/dashboard')
    // Should redirect to unauthorized or officer dashboard
    await expect(page).not.toHaveURL('/farmer/dashboard')
  })

  test('TC-7.8-06: farmer dashboard renders weather widget', async ({ page }) => {
    await loginAsFarmer(page)
    await page.goto('/farmer/dashboard')
    // Weather section exists (may show placeholder if no data)
    await expect(page.locator('[data-testid="weather-widget"]')).toBeVisible()
  })

})
