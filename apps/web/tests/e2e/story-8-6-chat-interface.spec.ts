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

test.describe('Story 8.6: Chat Market Interface', () => {
  test.beforeEach(async ({ page }) => {
    // Default to manager for most tests
    await mockSessionCookie(page, 'manager', 'Manager', 'manager-1')
  })

  test('T1: Manager page renders with layout and correct header', async ({ page }) => {
    await page.goto('/manager/chat')
    
    // Check main layout container
    const layout = page.locator('div[class*="chatLayout"]')
    await expect(layout).toBeVisible()
    
    // Check header
    const h1 = page.locator('h1')
    await expect(h1).toHaveText('Trợ lý Thị trường')
  })

  test('T2: History sidebar visible', async ({ page }) => {
    await page.goto('/manager/chat')
    
    const sidebar = page.locator('aside[class*="chatHistory"]')
    await expect(sidebar).toBeVisible()
    
    const historyItem = sidebar.locator('li').first()
    await expect(historyItem).toBeVisible()
  })

  test('T3 & T4: Mock messages visible with correct computed styles', async ({ page }) => {
    await page.goto('/manager/chat')
    
    const userMsg = page.locator('div[class*="userMessage"]').first()
    await expect(userMsg).toContainText('Giá chè búp khô hôm nay thế nào?')
    
    // Verify computed background color is #176c4b (rgb(23, 108, 75))
    await expect(userMsg).toHaveCSS('background-color', 'rgb(23, 108, 75)')
    
    const botMsg = page.locator('div[class*="botMessage"]').first()
    await expect(botMsg).toContainText('Theo cập nhật mới nhất')
    
    // Verify computed background color is #f2f5f2 (rgb(242, 245, 242))
    await expect(botMsg).toHaveCSS('background-color', 'rgb(242, 245, 242)')
  })

  test('T5: Mini chart visible', async ({ page }) => {
    await page.goto('/manager/chat')
    
    const chart = page.locator('div[class*="miniChart"]').first()
    await expect(chart).toBeVisible()
    
    const bars = chart.locator('div[class*="miniChartBar"]')
    // Should have 5 bars from mock data
    await expect(bars).toHaveCount(5)
  })

  test('T6 & T7: Composer input and send button interaction', async ({ page }) => {
    await page.goto('/manager/chat')
    
    const input = page.getByPlaceholder('Nhập câu hỏi...')
    await input.fill('Thời tiết ngày mai?')
    
    const sendBtn = page.locator('button[aria-label="Gửi"]')
    await expect(sendBtn).not.toBeDisabled()
    
    await sendBtn.click()
    
    // Verify new messages are added
    const messages = page.locator('div[class*="messageRowUser"]')
    await expect(messages).toHaveCount(2) // 1 mock + 1 new
    
    const userMsgs = page.locator('div[class*="userMessage"]')
    await expect(userMsgs.last()).toContainText('Thời tiết ngày mai?')
  })

  test('T8: New conversation button', async ({ page }) => {
    await page.goto('/manager/chat')
    
    const newChatBtn = page.locator('button', { hasText: 'Cuộc trò chuyện mới' })
    await newChatBtn.click()
    
    // Messages should be cleared
    await expect(page.locator('div[class*="userMessage"]')).toHaveCount(0)
    await expect(page.getByText('Hãy đặt câu hỏi để bắt đầu...')).toBeVisible()
  })

  test('T9: Mobile viewport hides sidebar', async ({ page }) => {
    await page.goto('/manager/chat')
    
    const sidebar = page.locator('aside[class*="chatHistory"]')
    await expect(sidebar).toBeVisible()
    
    // Set mobile viewport
    await page.setViewportSize({ width: 768, height: 1024 })
    
    // Should be hidden by CSS media query
    await expect(sidebar).not.toBeVisible()
  })

  test('T10: Officer page renders correctly', async ({ page }) => {
    // Clear manager session and mock officer
    await page.context().clearCookies()
    await mockSessionCookie(page, 'officer', 'Officer', 'officer-1')
    
    await page.goto('/officer/chat')
    
    const h1 = page.locator('h1')
    await expect(h1).toHaveText('Trợ lý Kỹ thuật')
    
    await expect(page.getByText('Kiến thức canh tác + VietGAP + Bệnh cây')).toBeVisible()
  })

  test('T11: Role guard prevents farmer access', async ({ page }) => {
    // Clear session and mock farmer
    await page.context().clearCookies()
    await mockSessionCookie(page, 'farmer', 'Farmer', 'farmer-1')
    
    await page.goto('/manager/chat')
    // Should redirect to unauthorized
    await expect(page).toHaveURL('/unauthorized')
    
    await page.goto('/officer/chat')
    // Should redirect to unauthorized
    await expect(page).toHaveURL('/unauthorized')
  })
})
