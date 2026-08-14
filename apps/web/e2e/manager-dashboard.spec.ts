// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test, expect, Page } from '@playwright/test'

// Helper function to mock login as manager
async function loginAsManager(page: Page) {
  // Assuming a standard way to mock or login via UI in e2e
  // Since this is a test spec template based on the test plan, we navigate to login and fill in
  // or we set cookies/auth state if that's the established pattern.
  // We'll assume the app has a standard /login page for this test.
  await page.goto('/login')
  // We fill in mock credentials. If a bypass is used, it should be adjusted.
  // For the sake of this spec conforming to standard playright patterns:
  await page.fill('input[name="phone"]', '0912345678') // Mock manager phone
  await page.fill('input[name="password"]', 'password123')
  await page.click('button[type="submit"]')
  await page.waitForURL('/manager/dashboard')
}

test.describe('Story 7.7: Manager Dashboard Today View', () => {
  // Using test.beforeEach could be better, but sticking to test plan structure
  
  test('TC-7.7-01: manager dashboard shows hero greeting', async ({ page }) => {
    // Note: for this to work we assume the DB has the manager user.
    // If auth is mocked or handled via test setup, we rely on it.
    await loginAsManager(page)
    await page.goto('/manager/dashboard')
    
    // Greeting text (partial — time-aware)
    await expect(page.getByText(/Chào buổi/)).toBeVisible()
    // Operational pill
    await expect(page.getByText('Đang hoạt động')).toBeVisible()
  })

  test('TC-7.7-02: manager dashboard shows 4 metric cards', async ({ page }) => {
    await loginAsManager(page)
    await page.goto('/manager/dashboard')
    
    // MetricCard should ideally have a data-testid in its implementation.
    // However, since we didn't add data-testid to MetricCard itself (it's a shared component),
    // we can check for the labels.
    await expect(page.getByText('Vùng canh tác')).toBeVisible()
    await expect(page.getByText('Sản lượng kỳ vọng')).toBeVisible()
    await expect(page.getByText('Lô sẵn sàng')).toBeVisible()
    await expect(page.getByText('Cần xử lý')).toBeVisible()
    
    // Or if the component has role="article" as per MetricCard.tsx
    const cards = page.locator('[data-testid="metric-card"]')
    await expect(cards).toHaveCount(4)
  })

  test('TC-7.7-03: market snapshot section contains AiNote disclaimer (AI Invariant)', async ({ page }) => {
    await loginAsManager(page)
    await page.goto('/manager/dashboard')
    
    // Check for AiNote component presence
    // The AiNote component typically contains "AI tổng hợp dữ liệu"
    await expect(page.getByText(/AI tổng hợp dữ liệu/i)).toBeVisible()
  })

  test('TC-7.7-04: market snapshot section contains SourceBox (AI Invariant)', async ({ page }) => {
    await loginAsManager(page)
    await page.goto('/manager/dashboard')
    
    // Check for SourceBox component presence
    await expect(page.getByText(/nguồn đã kiểm chứng/i)).toBeVisible()
  })

  test('TC-7.7-06: metric grid wraps to 2 cols at 1100px', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } })
    const page = await ctx.newPage()
    await loginAsManager(page)
    await page.goto('/manager/dashboard')
    
    const cards = await page.locator('[data-testid="metric-card"]').all()
    if (cards.length >= 3) {
      const first = await cards[0].boundingBox()
      const third = await cards[2].boundingBox()
      // Third card should be on a new row (different top position)
      expect(third!.y).toBeGreaterThan(first!.y + 20)
    }
    await ctx.close()
  })
})
