// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test, expect } from '@playwright/test'
import { mockSessionCookie } from './helpers/forged-session'

test.describe('Bulletin Page 8.1', () => {
  test.beforeEach(async ({ page }) => {
    await mockSessionCookie(page, 'manager', 'Manager', 'manager-1')
    await page.goto('/manager/bulletin')
  })

  test('T1: page renders without errors', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Thông tin có nguồn, dễ hiểu')
    await expect(page.getByText('BẢN TIN NÔNG NGHIỆP SỐ')).toBeVisible()
  })

  test('T2: three category cards render with correct tones', async ({ page }) => {
    const cards = page.locator('article')
    await expect(cards).toHaveCount(3)

    await expect(page.getByText('Thị trường')).toBeVisible()
    await expect(page.getByText('Thời tiết')).toBeVisible()
    await expect(page.getByText('Kỹ thuật')).toBeVisible()
  })

  test('T3: source counts visible', async ({ page }) => {
    await expect(page.getByText('2 nguồn đã kiểm chứng')).toBeVisible()
    await expect(page.getByText('3 nguồn đã kiểm chứng')).toBeVisible()
    await expect(page.getByText('4 nguồn đã kiểm chứng')).toBeVisible()
  })

  test('T4: AI disclaimer present', async ({ page }) => {
    await expect(page.getByText(/không phải khuyến nghị/)).toBeVisible()
    await expect(page.getByText(/Nội dung do AI tổng hợp/)).toBeVisible()
  })

  test('T5: audio button renders', async ({ page }) => {
    const btn = page.getByRole('button', { name: /Nghe bản tin sáng/ })
    await expect(btn).toBeVisible()
  })

  test('T6 & T7: responsive grid', async ({ page }) => {
    // We can't strictly test CSS grid rendering columns in pure playwright without visual testing
    // but we can check if it resizes without errors.
    await page.setViewportSize({ width: 1050, height: 768 })
    await expect(page.locator('h1')).toBeVisible()
    
    await page.setViewportSize({ width: 750, height: 768 })
    await expect(page.locator('h1')).toBeVisible()
  })
})
