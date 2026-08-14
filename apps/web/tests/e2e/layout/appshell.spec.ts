// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test, expect } from '@playwright/test'

// TODO(issue-72): E2E tests are skipped because the NextAuth Keycloak fixture (loginAsManager)
// is not yet implemented or stable. Currently, any forged JWT is rejected by the Edge Middleware.
test.describe('AppShell & Sidebar', () => {
  // Use the pre-existing auth state for manager role
  test.use({ storageState: 'playwright/.auth/manager.json' })

  test.skip('sidebar has correct dark green background', async ({ page }) => {
    await page.goto('/manager/dashboard')
    
    const sidebar = page.locator('[data-testid="sidebar"]')
    await expect(sidebar).toBeVisible()
    
    const bg = await sidebar.evaluate(el =>
      getComputedStyle(el).backgroundColor
    )
    // #143c2d = rgb(20, 60, 45)
    expect(bg).toBe('rgb(20, 60, 45)')
  })

  test.skip('active nav item has lime left border', async ({ page }) => {
    await page.goto('/manager/dashboard')
    
    const activeItem = page.locator('nav a[aria-current="page"]').first()
    await expect(activeItem).toBeVisible()
    
    const boxShadow = await activeItem.evaluate(el =>
      getComputedStyle(el).boxShadow
    )
    expect(boxShadow).toContain('rgb(214, 240, 92)') // #d6f05c
  })

  test.skip('mobile sidebar drawer opens and closes', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, // iPhone 14 Pro
      storageState: 'playwright/.auth/manager.json'
    })
    const page = await context.newPage()
    await page.goto('/manager/dashboard')
    
    // Sidebar should be hidden initially (transformed off screen)
    // Wait, transform is not visibility, Playwright might still see it as visible if not overflow hidden?
    // Actually if it's display none or translated, it might be outside viewport.

    
    // Click hamburger button
    await page.locator('[data-testid="menu-button"]').click()
    // Backdrop should appear
    await expect(page.locator('[data-testid="backdrop"]')).toBeVisible()
    
    // Click backdrop to close
    await page.locator('[data-testid="backdrop"]').click()
    await expect(page.locator('[data-testid="backdrop"]')).not.toBeVisible()
    
    await context.close()
  })

  test.skip('manager layout renders without errors', async ({ page }) => {
    await page.goto('/manager/dashboard')
    
    // No console errors
    const errors: string[] = []
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
    
    await expect(page.locator('main')).toBeVisible()
    expect(errors).toHaveLength(0)
  })

  test.skip('search input is hidden on mobile', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: 'playwright/.auth/manager.json'
    })
    const page = await context.newPage()
    await page.goto('/manager/dashboard')
    
    // Search wrap should not be visible
    await expect(page.locator('.searchWrap')).not.toBeVisible() // Using class is fragile, better to test input
    await expect(page.getByPlaceholder('Tìm kiếm...')).not.toBeVisible()
    
    await context.close()
  })

  test.skip('hamburger button visible on mobile, hidden on desktop', async ({ browser }) => {
    // Desktop (already handled by default viewport, but just to be sure)
    const desktopCtx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      storageState: 'playwright/.auth/manager.json'
    })
    const desktopPage = await desktopCtx.newPage()
    await desktopPage.goto('/manager/dashboard')
    await expect(desktopPage.locator('[data-testid="menu-button"]')).not.toBeVisible()
    await desktopCtx.close()

    // Mobile
    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: 'playwright/.auth/manager.json'
    })
    const mobilePage = await mobileCtx.newPage()
    await mobilePage.goto('/manager/dashboard')
    await expect(mobilePage.locator('[data-testid="menu-button"]')).toBeVisible()
    await mobileCtx.close()
  })

  test.skip('bottom nav is hidden on desktop', async ({ page }) => {
    await page.goto('/manager/dashboard')
    await expect(page.locator('[data-testid="bottom-nav"]')).not.toBeVisible()
  })

  test.skip('bottom nav shows max 4 items on mobile', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: 'playwright/.auth/manager.json'
    })
    const page = await context.newPage()
    await page.goto('/manager/dashboard')
    
    const items = page.locator('[data-testid="bottom-nav"] a')
    await expect(items).toHaveCount(4)
    
    await context.close()
  })
})
