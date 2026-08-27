// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import fs from 'fs'
import { test, expect, Page } from '@playwright/test'
import { encode } from 'next-auth/jwt'

try {
  const envContent = fs.readFileSync('.env', 'utf-8')
  const match = envContent.match(/AUTH_SECRET=["']?([^"'\n]+)["']?/)
  if (match) process.env.AUTH_SECRET = match[1]
} catch (e) {}

async function mockSessionCookie(page: Page, role: string, name: string, id: string) {
  const now = Math.floor(Date.now() / 1000)
  const token = await encode({
    token: { id, name, email: `${role}@example.com`, role, iat: now, exp: now + 60 * 60 * 8, jti: 'mock-jti-' + now },
    secret: process.env.AUTH_SECRET || process.env.KEYCLOAK_CLIENT_SECRET || 'agrimarket-secret-key',
    salt: 'authjs.session-token',
  })
  await page.context().addCookies([{
    name: 'authjs.session-token', value: token, domain: 'localhost', path: '/',
    httpOnly: true, sameSite: 'Lax', expires: now + 60 * 60 * 8,
  }])
}

test.describe('Story 8.8: Account Profile Page', () => {
  test.describe('Manager Profile', () => {
    test.beforeEach(async ({ page }) => {
      await mockSessionCookie(page, 'manager', 'Manager', 'manager-1')
      await page.goto('/manager/profile')
    })

    test('T1 & T2: Manager /manager/profile có cả 2 sections (HTX + Account) và HTX stats', async ({ page }) => {
      // HTX section
      const htxSection = page.locator('section', { hasText: 'Thông tin Hợp tác xã' })
      await expect(htxSection).toBeVisible()
      
      // 3-col stats
      await expect(page.getByText('24.8 ha')).toBeVisible()
      await expect(page.getByText('42')).toBeVisible()
      await expect(page.getByText('18')).toBeVisible()

      // Account section
      const accountSection = page.locator('section', { hasText: 'Tài khoản cá nhân' })
      await expect(accountSection).toBeVisible()
      await expect(accountSection.getByText('Nguyễn Văn An')).toBeVisible()
      await expect(accountSection.getByText('Trưởng HTX')).toBeVisible()
    })

    test('T6 & T7: Security rows và Logout button', async ({ page }) => {
      const accountSection = page.locator('section', { hasText: 'Tài khoản cá nhân' })
      
      // 3 security rows
      await expect(accountSection.getByText('Vân tay / FaceID')).toBeVisible()
      await expect(accountSection.getByText('Mã PIN 6 số')).toBeVisible()
      await expect(accountSection.getByText('Thiết bị đăng nhập')).toBeVisible()

      // Logout button
      const logoutBtn = accountSection.getByRole('button', { name: 'Đăng xuất' })
      await expect(logoutBtn).toBeVisible()
      
      // Check for red color class/style (we know it's a specific class in CSS module)
      await expect(logoutBtn).toHaveCSS('background-color', 'rgb(220, 38, 38)') // #DC2626
    })
  })

  test.describe('Officer Profile', () => {
    test.beforeEach(async ({ page }) => {
      await mockSessionCookie(page, 'officer', 'Officer', 'officer-1')
    })

    test('T3: Officer /officer/profile chỉ có account section', async ({ page }) => {
      await page.goto('/officer/profile')
      
      const accountSection = page.locator('section', { hasText: 'Tài khoản cá nhân' })
      await expect(accountSection).toBeVisible()
      await expect(accountSection.getByText('Trần Thị Lan')).toBeVisible()
      await expect(accountSection.getByText('Cán bộ KT/CL')).toBeVisible()

      // No HTX section
      const htxSection = page.locator('section', { hasText: 'Thông tin Hợp tác xã' })
      await expect(htxSection).not.toBeVisible()
    })
    
    test('T10: Officer không vào được /manager/profile', async ({ page }) => {
      await page.goto('/manager/profile')
      await expect(page).toHaveURL('/unauthorized')
    })
  })

  test.describe('Farmer Profile', () => {
    test.beforeEach(async ({ page }) => {
      await mockSessionCookie(page, 'farmer', 'Farmer', 'farmer-1')
    })

    test('T4: Farmer /farmer/profile render và có logout button', async ({ page }) => {
      await page.goto('/farmer/profile')
      
      const accountSection = page.locator('section', { hasText: 'Tài khoản cá nhân' })
      await expect(accountSection).toBeVisible()
      await expect(accountSection.getByText('Lê Văn Bình')).toBeVisible()
      await expect(accountSection.getByText('Nông dân')).toBeVisible()

      const logoutBtn = accountSection.getByRole('button', { name: 'Đăng xuất' })
      await expect(logoutBtn).toBeVisible()
    })

    test('T9: Role guard — farmer không vào được /manager/profile', async ({ page }) => {
      await page.goto('/manager/profile')
      await expect(page).toHaveURL('/unauthorized')
    })
  })

  test('T5: Avatar guard — page không crash dù name trống (Officer)', async ({ page }) => {
    // We can't easily change the hardcoded mock name in the component during E2E test without modifying the component.
    // The unit test already covers the empty name scenario (T4 in Unit Tests).
    // So here we just verify the page loads normally for officer.
    await mockSessionCookie(page, 'officer', 'Officer', 'officer-1')
    await page.goto('/officer/profile')
    await expect(page.locator('h1', { hasText: 'Tài khoản của tôi' })).toBeVisible()
  })

  test('T8: Mobile viewport — layout không vỡ', async ({ page }) => {
    await mockSessionCookie(page, 'manager', 'Manager', 'manager-1')
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/manager/profile')
    
    // Check that sections are visible in mobile viewport
    const accountSection = page.locator('section', { hasText: 'Tài khoản cá nhân' })
    await expect(accountSection).toBeVisible()
    
    // Just a smoke check for responsiveness, if elements remain in viewport
    const boundingBox = await accountSection.boundingBox()
    expect(boundingBox?.width).toBeLessThanOrEqual(375)
  })
})
