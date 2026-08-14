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
    const sidebar = page.locator('[data-testid="sidebar"]')
    
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
})
