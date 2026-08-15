// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.


import { test, expect } from '@playwright/test'

test.describe('TopBar Notifications', () => {
  test.use({ storageState: 'playwright/.auth/manager.json' })

  test('TC-7.11-06: notification bell visible in authenticated topbar', async ({ page }) => {
    await page.goto('/manager/dashboard')
    await expect(page.getByRole('button', { name: /thông báo/i })).toBeVisible()
  })
})
