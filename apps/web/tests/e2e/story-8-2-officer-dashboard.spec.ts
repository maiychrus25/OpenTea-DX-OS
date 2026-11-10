// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test, expect } from '@playwright/test'
import { mockSessionCookie } from './helpers/forged-session'

test.describe('Story 8.2: Officer Today Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockSessionCookie(page, 'officer', 'Officer User', 'officer-id-1')
  })

  test('T1: Page Renders for Officer Role', async ({ page }) => {
    await page.goto('/officer/dashboard')
    await expect(page.locator('h1')).toContainText('Công việc kỹ thuật hôm nay')
  })

  test('T2: 4 Metric Cards Present', async ({ page }) => {
    await page.goto('/officer/dashboard')
    const metrics = page.getByTestId('metric-card')
    await expect(metrics).toHaveCount(4)
    
    await expect(metrics.nth(0).locator('strong')).toHaveText('05')
    await expect(metrics.nth(1).locator('strong')).toHaveText('12')
    await expect(metrics.nth(2).locator('strong')).toHaveText('04')
    await expect(metrics.nth(3).locator('strong')).toContainText('14/18')
  })

  test('T3: Task Table Renders Correct Columns', async ({ page }) => {
    await page.goto('/officer/dashboard')
    const table = page.getByTestId('task-table')
    const thead = table.locator('thead')
    
    await expect(thead).toContainText('Thời gian')
    await expect(thead).toContainText('Công việc')
    await expect(thead).toContainText('Đối tượng')
    await expect(thead).toContainText('Trạng thái')

    const rows = table.locator('tbody tr')
    await expect(rows).toHaveCount(3)
  })

  test('T4: Status Pills Correct Tones', async ({ page }) => {
    await page.goto('/officer/dashboard')
    const table = page.getByTestId('task-table')
    
    // Check specific pill texts within the table
    const greenPill = table.getByText('Đã xác nhận')
    await expect(greenPill).toBeVisible()
    await expect(greenPill).toHaveClass(/green/)

    const amberPill = table.getByText('Cần xử lý')
    await expect(amberPill).toBeVisible()
    await expect(amberPill).toHaveClass(/amber/)

    const bluePill = table.getByText('Mục chờ')
    await expect(bluePill).toBeVisible()
    await expect(bluePill).toHaveClass(/blue/)
  })

  test('T5: Sidebar Badge Shows Count', async ({ page }) => {
    await page.goto('/officer/dashboard')
    const navItem = page.locator('[data-testid="sidebar"] nav a').filter({ hasText: 'Tổng quan' })
    const badge = navItem.locator('span').filter({ hasText: '5' })
    await expect(badge).toBeVisible()
  })

  test('T6: Manager Cannot Access Officer Dashboard', async ({ page }) => {
    // Clear cookie and mock manager session
    await page.context().clearCookies()
    await mockSessionCookie(page, 'manager', 'Manager User', 'manager-id-1')
    
    await page.goto('/officer/dashboard')
    // Should redirect away from officer dashboard
    await expect(page).not.toHaveURL('/officer/dashboard')
  })
})
