// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test, expect, Page } from '@playwright/test'
import { encode } from 'next-auth/jwt'

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

async function loginAsManager(page: Page) {
  await mockSessionCookie(page, 'manager', 'Manager User', 'manager-id-1')
}

test.describe('Manager Workflows', () => {

  test('Lot List: view list, verify filters and rows', async ({ page }) => {
    await loginAsManager(page)

    // Mock API for /api/lots
    await page.route('/api/lots*', async route => {
      const url = new URL(route.request().url())
      expect(url.searchParams.get('visibility')).toBe('published')
      
      const data = [
        { id: '1', lot_code: 'L01', commodity: 'Chè', status: 'READY', estimated_weight_kg: 500, created_at: '2026-08-20' },
        { id: '2', lot_code: 'L02', commodity: 'Chè Kim Tuyên', status: 'QR_EXPORTED', estimated_weight_kg: 1000, created_at: '2026-08-21' }
      ]

      await route.fulfill({ status: 200, json: { data } })
    })

    await page.goto('/manager/lots')

    // Expecting to see both lots on the 'Tất cả' tab
    await expect(page.getByText('L01')).toBeVisible()
    await expect(page.getByText('L02')).toBeVisible()

    await expect(page.getByRole('button', { name: /Tạo lô hàng/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Sửa|Xóa|Lưu nháp|Xuất QR/ })).toHaveCount(0)

    // Click 'Sẵn sàng' tab
    await page.getByRole('button', { name: /Sẵn sàng/ }).click()
    // Wait for the mock API to filter
    await expect(page.getByText('L01')).toBeVisible()
    await expect(page.getByText('L02')).not.toBeVisible()

    // Click 'Đã xuất QR' tab
    await page.getByRole('button', { name: /Đã xuất QR/ }).click()
    await expect(page.getByText('L02')).toBeVisible()
    await expect(page.getByText('L01')).not.toBeVisible()
  })
})
