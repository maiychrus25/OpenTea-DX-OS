# 🧪 Test Plan — Story 7.11: NotificationBell Component

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 7.11 — NotificationBell & TopBar Integration
**Date:** 2026-08-14
**Risk Level:** 🟡 MEDIUM — Client component với async fetch và click-outside logic. Rủi ro: dropdown không đóng, badge hiện sai, API endpoint chưa có.

---

## Test Cases

### TC-7.11-01: Bell Badge Hidden When No Unread (Unit)

```typescript
import { render, screen } from '@testing-library/react'
// Mock fetch to return 0 unread
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ notifications: [] }),
})

test('badge not visible when no unread notifications', async () => {
  render(<NotificationBell role="manager" />)
  await waitForElementToBeRemoved(() => screen.queryByTestId('loading'))
  expect(screen.queryByTestId('notif-badge')).not.toBeInTheDocument()
})
```
**Priority:** P1

---

### TC-7.11-02: Bell Badge Shows Unread Count (Unit)

```typescript
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    notifications: [
      { id: '1', title: 'Test', detail: 'Detail', tone: 'green', created_at: new Date().toISOString(), read: false },
      { id: '2', title: 'Test2', detail: 'Detail2', tone: 'amber', created_at: new Date().toISOString(), read: false },
    ],
  }),
})

test('badge shows unread count', async () => {
  render(<NotificationBell role="manager" />)
  const badge = await screen.findByTestId('notif-badge')
  expect(badge).toHaveTextContent('2')
})
```
**Priority:** P0

---

### TC-7.11-03: Click Bell Opens Dropdown (Unit)

```typescript
test('clicking bell opens notification panel', async () => {
  render(<NotificationBell role="manager" />)
  const bell = screen.getByRole('button', { name: /thông báo/i })
  await userEvent.click(bell)
  expect(screen.getByTestId('notif-panel')).toBeVisible()
})
```
**Priority:** P0

---

### TC-7.11-04: Click Outside Closes Dropdown (Unit)

```typescript
test('clicking outside closes notification panel', async () => {
  render(
    <div>
      <NotificationBell role="manager" />
      <div data-testid="outside">Outside</div>
    </div>
  )
  await userEvent.click(screen.getByRole('button', { name: /thông báo/i }))
  expect(screen.getByTestId('notif-panel')).toBeVisible()
  await userEvent.click(screen.getByTestId('outside'))
  expect(screen.queryByTestId('notif-panel')).not.toBeInTheDocument()
})
```
**Priority:** P1

---

### TC-7.11-05: "Xem tất cả" Link Points to Correct Role Route (Unit)

```typescript
test('see-all link uses correct role', async () => {
  render(<NotificationBell role="manager" />)
  await userEvent.click(screen.getByRole('button', { name: /thông báo/i }))
  const link = screen.getByRole('link', { name: /xem tất cả/i })
  expect(link).toHaveAttribute('href', '/manager/notifications')
})
```
**Priority:** P1

---

### TC-7.11-06: NotificationBell Visible in TopBar (E2E)

```typescript
test('notification bell visible in authenticated topbar', async ({ page }) => {
  await loginAsManager(page)
  await page.goto('/manager/dashboard')
  await expect(page.getByRole('button', { name: /thông báo/i })).toBeVisible()
})
```
**Priority:** P0

---

### TC-7.11-07: API Route Returns 401 Unauthenticated (Unit)

```typescript
test('GET /api/notifications returns 401 without auth', async () => {
  const req = new Request('http://localhost/api/notifications')
  // Mock auth() to return null
  jest.mock('@/auth', () => ({ auth: jest.fn().mockResolvedValue(null) }))
  const { GET } = await import('@/app/api/notifications/route')
  const res = await GET(req)
  expect(res.status).toBe(401)
})
```
**Priority:** P0

---

## Test Execution Plan

```
P0 (blocking):
  TC-7.11-02: Badge shows unread count
  TC-7.11-03: Click opens dropdown
  TC-7.11-06: Bell in TopBar
  TC-7.11-07: API auth guard

P1 (important):
  TC-7.11-01: No badge when no unread
  TC-7.11-04: Click outside closes
  TC-7.11-05: See-all link correct route
```

---

## Definition of Done for Story 7.11

- [ ] `TC-7.11-01` PASS: No badge when no unread
- [ ] `TC-7.11-02` PASS: Badge count correct
- [ ] `TC-7.11-03` PASS: Click opens panel
- [ ] `TC-7.11-04` PASS: Click outside closes
- [ ] `TC-7.11-05` PASS: Link correct role
- [ ] `TC-7.11-06` PASS: Bell visible in TopBar
- [ ] `TC-7.11-07` PASS: API auth guard
- [ ] `npm run build` pass
- [ ] Committed với: `feat(ui): implement NotificationBell component with TopBar integration`
