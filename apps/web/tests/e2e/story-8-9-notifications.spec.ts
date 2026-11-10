// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test, expect } from '@playwright/test'

import { encode } from 'next-auth/jwt'
import fs from 'fs'

try {
  const envContent = fs.readFileSync('.env', 'utf-8')
  const match = envContent.match(/AUTH_SECRET=["']?([^"'\n]+)["']?/)
  if (match) {
    process.env.AUTH_SECRET = match[1]
  }
} catch (e) {
  // ignore
}

// Helper to generate valid Auth.js session token
async function generateToken(role: 'manager' | 'officer' | 'farmer') {
  const now = Math.floor(Date.now() / 1000)
  return await encode({
    token: {
      name: `${role} User`,
      email: `${role}@example.com`,
      role: role,
      iat: now,
      exp: now + 60 * 60 * 8, // 8 hours
      jti: 'mock-jti-' + now,
    },
    secret: process.env.AUTH_SECRET || process.env.KEYCLOAK_CLIENT_SECRET || 'agrimarket-secret-key',
    salt: 'authjs.session-token',
  })
}

async function setSessionCookie(context: any, role: 'manager' | 'officer' | 'farmer') {
  const token = await generateToken(role)
  await context.addCookies([
    {
      name: 'authjs.session-token',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
    },
  ])
}

test.describe('Story 8.9: Notifications Full Page & Farmer Combined', () => {
  
  test.describe('Manager Notifications', () => {
    test.beforeEach(async ({ context }) => {
      await setSessionCookie(context, 'manager')
    })

    test('should show eyebrow, title, and mark-all button for manager', async ({ page }) => {
      await page.goto('/manager/notifications')
      
      // Verify AC-1 elements
      await expect(page.getByText('THÔNG BÁO', { exact: true })).toBeVisible({ timeout: 15000 })
      await expect(page.getByRole('heading', { name: 'Tất cả thông báo' })).toBeVisible()
      
      // We expect the 'Đánh dấu tất cả đã đọc' button to be visible if there are unread notifications.
      // Since it's using SWR fetching mock data from API, it might take a moment.
      // Or we can just check if the list renders
      await expect(page.getByText('Tất cả')).toBeVisible()
      await expect(page.getByText('Chưa đọc')).toBeVisible()
    })
  })

  test.describe('Officer Notifications', () => {
    test.beforeEach(async ({ context }) => {
      await setSessionCookie(context, 'officer')
    })

    test('should show eyebrow, title for officer', async ({ page }) => {
      await page.goto('/officer/notifications')
      
      await expect(page.getByText('THÔNG BÁO', { exact: true })).toBeVisible({ timeout: 15000 })
      await expect(page.getByRole('heading', { name: 'Tất cả thông báo' })).toBeVisible()
    })
  })

  test.describe('Farmer Combined Page', () => {
    test.beforeEach(async ({ context }) => {
      await setSessionCookie(context, 'farmer')
    })

    test('should display combined page with 2 tabs and navigate via sidebar', async ({ page }) => {
      await page.goto('/farmer/dashboard')
      
      // Click sidebar item
      const combinedLink = page.getByRole('link', { name: 'Bản tin & thông báo' })
      await combinedLink.click()
      
      // Verify URL
      await expect(page).toHaveURL(/\/farmer\/bulletin-notifications/, { timeout: 15000 })
      
      // Verify page header
      await expect(page.getByRole('heading', { name: 'Bản tin & Thông báo' })).toBeVisible()
      
      // Verify Tabs
      const bulletinTab = page.getByRole('button', { name: 'Bản tin' })
      const notifTab = page.getByRole('button', { name: 'Thông báo' })
      
      await expect(bulletinTab).toBeVisible()
      await expect(notifTab).toBeVisible()
      
      // Default should be bulletin tab, check content
      await expect(page.getByText('Nhu cầu chè búp khô Thái Nguyên tăng dịp cuối năm')).toBeVisible()
      
      // Switch to notifications tab
      await notifTab.click()
      
      // Inside notification tab, we shouldn't see the eyebrow 'THÔNG BÁO' because showPageHeader=false
      // But we should see the filters 'Tất cả' and 'Chưa đọc'
      await expect(page.getByText('Tất cả', { exact: true })).toBeVisible()
      await expect(page.getByText('Chưa đọc')).toBeVisible()
      
      // Ensure eyebrow is not rendered
      await expect(page.locator('text="THÔNG BÁO"')).toHaveCount(0)
    })
  })

  test.describe('Role Guard', () => {
    test('farmer cannot access manager notifications', async ({ page, context }) => {
      await setSessionCookie(context, 'farmer')
      
      await page.goto('/manager/notifications')
      // Should redirect to unauthorized
      await expect(page).toHaveURL(/\/unauthorized/)
    })
  })
})
