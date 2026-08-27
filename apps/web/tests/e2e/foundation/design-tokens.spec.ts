// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test, expect } from '@playwright/test'

test.describe('Foundation Design Tokens', () => {
  test('Be Vietnam Pro font is loaded', async ({ page }) => {
    await page.goto('/login')
    
    const fontFamily = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--font-be-vietnam').trim()
    })
    
    expect(fontFamily).not.toBe('')
    expect(fontFamily.toLowerCase()).toContain('be vietnam pro')
    
    // Font should be applied to body
    const bodyFont = await page.evaluate(() => {
      return getComputedStyle(document.body).fontFamily
    })
    
    expect(bodyFont).toContain('Be Vietnam Pro')
  })

  test('login page renders without visual regression', async ({ page }) => {
    await page.goto('/login')
    
    await expect(page.getByTestId('auth-panel')).toBeVisible()
    await expect(page.getByRole('button', { name: /keycloak/i })).toBeVisible()
    
    // No console errors
    const errors: string[] = []
    page.on('console', msg => { 
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })
    
    // Wait for network idle to ensure all resources are loaded
    await page.waitForLoadState('networkidle')
    
    expect(errors).toHaveLength(0)
  })
})
