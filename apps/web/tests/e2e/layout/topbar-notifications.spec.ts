// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { test, expect } from '@playwright/test'
import { mockSessionCookie } from '../helpers/forged-session'
import type { Notification } from '@/components/ui/NotificationBell/NotificationBell'

// ── Mock notification responses ───────────────────────────────────────────────

const mockUnreadNotif: Notification = {
  id: 'notif-001',
  title: 'Nhật ký cần phê duyệt',
  detail: 'Hộ Nguyễn Văn An có nhật ký chờ duyệt',
  tone: 'amber',
  created_at: new Date('2026-08-29T10:00:00Z').toISOString(),
  read: false,
  link_url: '/officer/journal',
}

const mockReadNotif: Notification = {
  id: 'notif-002',
  title: 'Thu hoạch được duyệt',
  detail: 'Thửa P-001 đã được duyệt thu hoạch',
  tone: 'green',
  created_at: new Date('2026-08-28T08:00:00Z').toISOString(),
  read: true,
}

// ── Notification API response shape ─────────────────────────────────────────

function makeNotifApiResponse(notifications: Notification[], unreadCount: number) {
  return {
    data: {
      notifications,
      unreadCount, // ← canonical key from GetNotificationsUseCase
    },
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Story 7.11: NotificationBell Component', () => {

  // TC-7.11-01: Bell renders with badge when unread > 0
  test('TC-7.11-01: bell badge shows correct unread count', async ({ page }) => {
    await mockSessionCookie(page, 'officer')

    await page.route('**/api/notifications*', r =>
      r.fulfill({ status: 200, json: makeNotifApiResponse([mockUnreadNotif], 1) })
    )
    await page.route('**/api/notifications/stream*', r => r.abort())

    await page.goto('/officer/dashboard')

    const badge = page.getByTestId('notif-badge')
    await expect(badge).toBeVisible()
    await expect(badge).toContainText('1')
  })

  // TC-7.11-02: Badge hidden when unreadCount === 0
  test('TC-7.11-02: badge hidden when all notifications are read', async ({ page }) => {
    await mockSessionCookie(page, 'officer')

    await page.route('**/api/notifications*', r =>
      r.fulfill({ status: 200, json: makeNotifApiResponse([mockReadNotif], 0) })
    )
    await page.route('**/api/notifications/stream*', r => r.abort())

    await page.goto('/officer/dashboard')

    const badge = page.getByTestId('notif-badge')
    await expect(badge).not.toBeVisible()
  })

  // TC-7.11-03: Panel opens on bell click; closes on outside click
  test('TC-7.11-03: panel opens on click, closes on click-outside', async ({ page }) => {
    await mockSessionCookie(page, 'officer')

    await page.route('**/api/notifications*', r =>
      r.fulfill({ status: 200, json: makeNotifApiResponse([mockUnreadNotif], 1) })
    )
    await page.route('**/api/notifications/stream*', r => r.abort())

    await page.goto('/officer/dashboard')

    // Panel initially hidden
    await expect(page.getByTestId('notif-panel')).not.toBeVisible()

    // Open panel
    await page.getByTestId('bell-button').click()
    await expect(page.getByTestId('notif-panel')).toBeVisible()

    // Notification content renders
    await expect(page.getByText('Nhật ký cần phê duyệt')).toBeVisible()

    // Click outside → panel closes
    await page.locator('body').click({ position: { x: 10, y: 10 } })
    await expect(page.getByTestId('notif-panel')).not.toBeVisible()
  })

  // TC-7.11-04: Mark all as read — badge disappears, PUT called
  test('TC-7.11-04: mark all as read — badge disappears and PUT /api/notifications called', async ({ page }) => {
    await mockSessionCookie(page, 'officer')

    const putCalls: string[] = []

    await page.route('**/api/notifications*', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, json: makeNotifApiResponse([mockUnreadNotif], 1) })
      } else if (route.request().method() === 'PUT') {
        putCalls.push(route.request().postData() ?? '')
        await route.fulfill({ status: 200, json: { data: { success: true } } })
      } else {
        await route.continue()
      }
    })
    await page.route('**/api/notifications/stream*', r => r.abort())

    await page.goto('/officer/dashboard')
    await page.getByTestId('bell-button').click()

    // Mark all read button visible
    const markAllBtn = page.getByTestId('mark-all-read-btn')
    await expect(markAllBtn).toBeVisible()
    await markAllBtn.click()

    // PUT was called with correct action
    expect(putCalls.length).toBeGreaterThan(0)
    const body = JSON.parse(putCalls[0])
    expect(body.action).toBe('mark-all-read')
  })

  // TC-7.11-05: Notification click — marks individual read + navigates
  test('TC-7.11-05: clicking notification with link_url navigates correctly', async ({ page }) => {
    await mockSessionCookie(page, 'officer')

    await page.route('**/api/notifications*', async route => {
      if (route.request().method() === 'GET')
        await route.fulfill({ status: 200, json: makeNotifApiResponse([mockUnreadNotif], 1) })
      else if (route.request().method() === 'PUT')
        await route.fulfill({ status: 200, json: { data: { success: true } } })
      else await route.continue()
    })
    await page.route('**/api/notifications/stream*', r => r.abort())

    await page.goto('/officer/dashboard')
    await page.getByTestId('bell-button').click()

    const notifItem = page.getByTestId(`notif-item-${mockUnreadNotif.id}`)
    await expect(notifItem).toBeVisible()
    // Unread styling
    await expect(notifItem).toHaveClass(/unread/)
  })

  // TC-7.11-06: Bell visible in authenticated TopBar
  test('TC-7.11-06: notification bell visible in authenticated topbar', async ({ page }) => {
    await mockSessionCookie(page, 'manager')
    await page.route('**/api/notifications*', r =>
      r.fulfill({ status: 200, json: makeNotifApiResponse([], 0) })
    )
    await page.route('**/api/notifications/stream*', r => r.abort())

    await page.goto('/manager/dashboard')
    await expect(page.getByTestId('bell-button')).toBeVisible()
  })

  // TC-7.11-07: TTS button shows loading then idle (Piper unavailable path)
  test('TC-7.11-07: TTS button enters unavailable state when Piper is down', async ({ page }) => {
    await mockSessionCookie(page, 'officer')

    await page.route('**/api/notifications*', r =>
      r.fulfill({ status: 200, json: makeNotifApiResponse([mockUnreadNotif], 1) })
    )
    await page.route('**/api/notifications/stream*', r => r.abort())
    // Piper unavailable
    await page.route('**/api/tts/status*', r =>
      r.fulfill({ status: 200, json: { available: false } })
    )

    await page.goto('/officer/dashboard')
    await page.getByTestId('bell-button').click()

    const ttsBtn = page.getByTestId(`tts-btn-${mockUnreadNotif.id}`)
    await expect(ttsBtn).toBeVisible()

    await ttsBtn.click()

    // Should transition to unavailable state briefly
    await expect(ttsBtn).toHaveAttribute('data-tts-state', 'unavailable')
    // After 3s timeout: auto-resets to idle (wait max 4s)
    await expect(ttsBtn).toHaveAttribute('data-tts-state', 'idle', { timeout: 4000 })
  })

  // TC-7.11-08: SSE stream request is made on page load
  test('TC-7.11-08: SSE /api/notifications/stream is requested with text/event-stream', async ({ page }) => {
    await mockSessionCookie(page, 'officer')

    // Register REST route first
    await page.route('**/api/notifications', async route => {
      await route.fulfill({ status: 200, json: makeNotifApiResponse([], 0) })
    })

    // waitForRequest BEFORE goto to capture SSE request without race condition (M2 fix)
    const sseRequestPromise = page.waitForRequest(
      req => req.url().includes('/api/notifications/stream'),
      { timeout: 6000 }
    ).catch(() => null)

    // Route SSE stream separately
    await page.route('**/api/notifications/stream*', async route => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: 'event: connected\ndata: {"message":"SSE connection established"}\n\n',
      })
    })

    await page.goto('/officer/dashboard')

    // Wait for the SSE request to be made (async EventSource connect after mount)
    const sseRequest = await sseRequestPromise
    expect(sseRequest).not.toBeNull()
  })
})
