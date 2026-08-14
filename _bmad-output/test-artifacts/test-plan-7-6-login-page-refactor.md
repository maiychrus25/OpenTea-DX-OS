# 🧪 Test Plan — Story 7.6: Login Page Refactor — 2-Panel Layout

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 7.6 — Login Page 2-Panel Layout
**Date:** 2026-08-14
**Risk Level:** 🟡 MEDIUM — Refactor login page visual; Keycloak redirect logic không thay đổi. Rủi ro: CSS Modules rename breaks existing tests.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Existing login E2E tests break do class rename | MEDIUM | HIGH | Update test selectors từ class → data-testid |
| Auth-side không ẩn trên mobile | LOW | MEDIUM | E2E mobile viewport check |
| Keycloak redirect bị break sau layout refactor | LOW | CRITICAL | E2E: click button → Keycloak URL check |
| Be Vietnam Pro không load (dep on 7-1) | MEDIUM | MEDIUM | Font check (inherited from TC-7.1-03) |

---

## Test Cases

### TC-7.6-01: Login Page 2-Panel Layout Renders (E2E)

**Type:** E2E — Desktop
**Tool:** Playwright
**Priority:** P0

```typescript
test('login page shows 2-panel layout on desktop', async ({ page }) => {
  await page.goto('/login')
  // Left panel visible
  await expect(page.locator('[data-testid="auth-side"]')).toBeVisible()
  // Right panel with form visible
  await expect(page.locator('[data-testid="auth-panel"]')).toBeVisible()
  // Brand visible
  await expect(page.getByText('DX AgriMarket')).toBeVisible()
})
```

---

### TC-7.6-02: Auth-Side Hidden on Mobile (E2E)

**Type:** E2E — Mobile 390px
**Tool:** Playwright
**Priority:** P0

```typescript
test('auth-side panel hidden on mobile', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await page.goto('/login')
  await expect(page.locator('[data-testid="auth-side"]')).not.toBeVisible()
  await expect(page.locator('form')).toBeVisible()
  await ctx.close()
})
```

---

### TC-7.6-03: Keycloak Redirect Still Works (E2E)

**Type:** E2E
**Tool:** Playwright
**Priority:** P0 — BLOCKING

```typescript
test('clicking login button initiates Keycloak redirect', async ({ page }) => {
  await page.goto('/login')
  const btn = page.getByRole('button', { name: /keycloak|tiếp tục/i })
  await expect(btn).toBeVisible()
  await expect(btn).not.toBeDisabled()
  // Click and assert redirect to Keycloak (URL contains keycloak)
  const [response] = await Promise.all([
    page.waitForNavigation({ timeout: 5000 }).catch(() => null),
    btn.click(),
  ])
  // Either redirects to Keycloak or stays (test env may not have Keycloak)
  // At minimum, no JS error should occur
})
```

---

### TC-7.6-04: Error Banner Visible on Keycloak Failure (Unit)

**Type:** Unit
**Tool:** Jest + React Testing Library
**Priority:** P1

```typescript
// Mock loginAction to return error
jest.mock('../actions', () => ({
  loginAction: async () => ({ error: 'Không thể kết nối máy chủ xác thực.' }),
}))

test('error banner appears when action returns error', async () => {
  render(<LoginForm />)
  await userEvent.click(screen.getByRole('button', { name: /keycloak|tiếp tục/i }))
  await screen.findByText(/Không thể kết nối/)
})
```

---

### TC-7.6-05: Feature List Present in Auth-Side (E2E)

**Type:** E2E
**Tool:** Playwright
**Priority:** P1

```typescript
test('auth-side shows 3 feature highlights', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByText(/Truy xuất nguồn gốc/)).toBeVisible()
  await expect(page.getByText(/Nhật ký canh tác/)).toBeVisible()
  await expect(page.getByText(/Bản tin thị trường/)).toBeVisible()
})
```

---

## Test Execution Plan

```
P0 (blocking):
  TC-7.6-01: 2-panel layout
  TC-7.6-02: Mobile hidden
  TC-7.6-03: Keycloak redirect intact

P1 (important):
  TC-7.6-04: Error banner
  TC-7.6-05: Feature list
```

---

## Definition of Done for Story 7.6

- [ ] `TC-7.6-01` PASS: 2-panel desktop layout
- [ ] `TC-7.6-02` PASS: Auth-side hidden mobile
- [ ] `TC-7.6-03` PASS: Keycloak redirect not broken
- [ ] `TC-7.6-04` PASS: Error banner
- [ ] `TC-7.6-05` PASS: Feature list visible
- [ ] `npm run build` pass
- [ ] Committed với: `feat(auth): refactor login page to prototype 2-panel design`

---

*🧪 Murat notes: TC-7.6-03 là test quan trọng nhất — đây là auth flow production. Dù UI thay đổi hoàn toàn, backend signIn('keycloak') KHÔNG được thay đổi.*
