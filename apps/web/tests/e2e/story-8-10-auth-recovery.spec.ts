// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test, expect } from '@playwright/test'


// ─── Registration Flow ─────────────────────────────────────────────────────────
test.describe('Story 8.10: Registration Flow', () => {
  test('renders registration form with all required fields', async ({ page }) => {
    await page.goto('/register')
    await expect(page.locator('[data-testid="register-form"]')).toBeVisible()
    await expect(page.locator('[data-testid="input-fullname"]')).toBeVisible()
    await expect(page.locator('[data-testid="input-phone"]')).toBeVisible()
    await expect(page.locator('[data-testid="select-htx"]')).toBeVisible()
    await expect(page.locator('[data-testid="input-pin"]')).toBeVisible()
    await expect(page.locator('[data-testid="input-confirm-pin"]')).toBeVisible()
    await expect(page.locator('[data-testid="checkbox-consent"]')).toBeVisible()
    await expect(page.locator('[data-testid="mock-mode-banner"]')).toBeVisible()
  })

  test('shows field errors on empty submit', async ({ page }) => {
    await page.goto('/register')
    await page.locator('[data-testid="register-submit-btn"]').click()
    await expect(page.locator('[data-testid="error-fullname"]')).toBeVisible()
    await expect(page.locator('[data-testid="error-phone"]')).toBeVisible()
    await expect(page.locator('[data-testid="error-htx"]')).toBeVisible()
    await expect(page.locator('[data-testid="error-pin"]')).toBeVisible()
    await expect(page.locator('[data-testid="error-consent"]')).toBeVisible()
  })

  test('shows pending-approval state after valid registration', async ({ page }) => {
    await page.goto('/register')
    await page.fill('[data-testid="input-fullname"]', 'Nguyễn Văn An')
    await page.fill('[data-testid="input-phone"]', '0901234567')
    await page.selectOption('[data-testid="select-htx"]', { index: 1 })
    await page.fill('[data-testid="input-pin"]', '123456')
    await page.fill('[data-testid="input-confirm-pin"]', '123456')
    await page.check('[data-testid="checkbox-consent"]')
    await page.locator('[data-testid="register-submit-btn"]').click()

    // Wait for mock delay + state transition
    await expect(page.locator('[data-testid="pending-approval-state"]')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/chờ phê duyệt/i)).toBeVisible()
    // AC-5: still on /register, no navigation
    await expect(page).toHaveURL('/register')
  })

  test('AC-5: mock mode never creates session after register', async ({ page }) => {
    await page.goto('/register')
    await page.fill('[data-testid="input-fullname"]', 'Test User')
    await page.fill('[data-testid="input-phone"]', '0901234567')
    await page.selectOption('[data-testid="select-htx"]', { index: 1 })
    await page.fill('[data-testid="input-pin"]', '123456')
    await page.fill('[data-testid="input-confirm-pin"]', '123456')
    await page.check('[data-testid="checkbox-consent"]')

    // Listen for any cookies set during/after submit
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/auth') || resp.url().includes('/register'),
      { timeout: 3000 }
    ).catch(() => null)

    await page.locator('[data-testid="register-submit-btn"]').click()
    await responsePromise

    // No auth session cookie should be created
    const cookies = await page.context().cookies()
    const authCookie = cookies.find((c) => c.name === 'authjs.session-token')
    // authCookie from mockSessionCookie would only exist if we set it
    // In this test we did NOT call mockSessionCookie, so it should not exist
    // (The mock form never calls signIn)
    expect(authCookie).toBeUndefined()
  })
})

// ─── Forgot PIN guidance ──────────────────────────────────────────────────────
test.describe('Story 8.10: Forgot PIN guidance', () => {
  test('login page tells the person to contact the cooperative officer, with no recovery link', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('[data-testid="forgot-pin-note"]')).toContainText('liên hệ cán bộ HTX')
    await expect(page.locator('a[href="/forgot-pin"]')).toHaveCount(0)
  })

  test('the deleted /forgot-pin page is no longer public: a visitor lands on the login page', async ({ page }) => {
    await page.goto('/forgot-pin')
    await expect(page).toHaveURL(/\/login/)
  })
})

// ─── Login Error States ────────────────────────────────────────────────────────
test.describe('Story 8.10: Login Error States (AC-3)', () => {
  test('shows locked error banner with contact guidance', async ({ page }) => {
    await page.goto('/login?error=locked')
    await expect(page.locator('[data-testid="error-locked"]')).toBeVisible()
    await expect(page.locator('[data-testid="error-locked"]')).toContainText('bị khóa')
    await expect(page.locator('[data-testid="locked-recovery-note"]')).toContainText('liên hệ cán bộ HTX')
  })

  test('shows wrong-pin error banner', async ({ page }) => {
    await page.goto('/login?error=wrong-pin')
    await expect(page.locator('[data-testid="error-wrong-pin"]')).toBeVisible()
    await expect(page.locator('[data-testid="error-wrong-pin"]')).toContainText('Sai mã PIN')
  })

  test('shows unavailable error banner', async ({ page }) => {
    await page.goto('/login?error=unavailable')
    await expect(page.locator('[data-testid="error-unavailable"]')).toBeVisible()
    await expect(page.locator('[data-testid="error-unavailable"]')).toContainText('không khả dụng')
  })

  test('shows invalid-phone error banner', async ({ page }) => {
    await page.goto('/login?error=invalid-phone')
    await expect(page.locator('[data-testid="error-invalid-phone"]')).toBeVisible()
    await expect(page.locator('[data-testid="error-invalid-phone"]')).toContainText('không hợp lệ')
  })

  test('register link visible on login page', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('[data-testid="register-link"]')).toBeVisible()
  })
})

// ─── AC-4: Unauthorized Page States ───────────────────────────────────────────
test.describe('Story 8.10: Unauthorized Page States (AC-4)', () => {
  test('default state shows 403', async ({ page }) => {
    await page.goto('/unauthorized')
    await expect(page.locator('[data-testid="state-unauthorized"]')).toBeVisible()
    await expect(page.getByText(/403/)).toBeVisible()
  })

  test('?state=pending shows pending view', async ({ page }) => {
    await page.goto('/unauthorized?state=pending')
    await expect(page.locator('[data-testid="state-pending"]')).toBeVisible()
    await expect(page.getByText(/chờ phê duyệt/i)).toBeVisible()
    await expect(page.locator('[data-testid="back-to-login-btn"]')).toBeVisible()
  })

  test('?state=locked shows locked view with contact guidance', async ({ page }) => {
    await page.goto('/unauthorized?state=locked')
    await expect(page.locator('[data-testid="state-locked"]')).toBeVisible()
    await expect(page.getByText(/bị khóa/i)).toBeVisible()
    await expect(page.locator('[data-testid="locked-forgot-pin-note"]')).toContainText('liên hệ cán bộ HTX')
  })
})

// ─── 8.10-SEC-001: Mock UI Security ───────────────────────────────────────────
test.describe('Story 8.10: Security (8.10-SEC-001)', () => {
  test('protected routes still require auth after mock forms', async ({ page }) => {
    // After register mock flow, navigating to /manager should redirect
    await page.goto('/register')
    await page.fill('[data-testid="input-fullname"]', 'Test')
    await page.fill('[data-testid="input-phone"]', '0901234567')
    await page.selectOption('[data-testid="select-htx"]', { index: 1 })
    await page.fill('[data-testid="input-pin"]', '123456')
    await page.fill('[data-testid="input-confirm-pin"]', '123456')
    await page.check('[data-testid="checkbox-consent"]')
    await page.locator('[data-testid="register-submit-btn"]').click()
    await page.waitForSelector('[data-testid="pending-approval-state"]', { timeout: 5000 })

    // Navigate to protected route — should NOT be accessible
    await page.goto('/manager')
    // Should redirect to login
    await expect(page).not.toHaveURL('/manager')
  })
})
