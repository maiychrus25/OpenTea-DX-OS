# 🧪 Test Plan — Story 7.2: AppShell & Sidebar Refactor

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 7.2 — AppShell & Sidebar Refactor — Prototype Design
**Date:** 2026-08-14
**Risk Level:** 🟠 HIGH — Layout shell ảnh hưởng tất cả authenticated pages. Mobile drawer state là client logic mới. Rủi ro chính: sidebar ẩn trên mobile mà không thể mở, active state không đúng, AppShell interface bị break.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AppShell interface bị break → manager layout fail | MEDIUM | HIGH | Unit test props interface |
| Mobile sidebar không mở/đóng | MEDIUM | HIGH | E2E test mobile viewport |
| Active nav item không highlight | LOW | MEDIUM | Unit test isActive logic |
| Sidebar CSS color sai (background không phải #143c2d) | LOW | HIGH | E2E computed style check |
| Existing manager layout cần update | LOW | HIGH | Integration test manager route |

---

## Test Strategy

1. **Unit:** Test `isActive()` logic, test Sidebar props render
2. **Component:** React Testing Library render Sidebar với navItems
3. **E2E Desktop:** Verify sidebar visible, color, active state
4. **E2E Mobile:** Verify sidebar hidden → hamburger → open → backdrop close

**Test files:**
- `apps/web/src/__tests__/components/layout/Sidebar.test.tsx`
- `apps/web/tests/e2e/layout/appshell.spec.ts`

---

## Test Cases

### TC-7.2-01: isActive() Logic (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P0

```typescript
// __tests__/components/layout/Sidebar.test.tsx
describe('isActive()', () => {
  it('returns true when pathname exactly matches href', () => {
    expect(isActive('/manager/dashboard', '/manager/dashboard')).toBe(true)
  })
  it('returns true when pathname starts with href + /', () => {
    expect(isActive('/manager/lots/123', '/manager/lots')).toBe(true)
  })
  it('returns false when no match', () => {
    expect(isActive('/manager/dashboard', '/manager/lots')).toBe(false)
  })
  it('returns false for root when pathname is not /', () => {
    expect(isActive('/manager/dashboard', '/')).toBe(false)
  })
})
```

**Pass Criteria:** Tất cả 4 assertions pass.

---

### TC-7.2-02: Sidebar Renders Brand Block (Component)

**Type:** Component
**Tool:** Jest + React Testing Library
**Priority:** P1

```typescript
import { render, screen } from '@testing-library/react'
import { Sidebar } from '@/components/layout/Sidebar/Sidebar'

const mockItems = [{ label: 'Dashboard', href: '/manager/dashboard', icon: <span /> }]

test('Sidebar renders brand block', () => {
  render(<Sidebar navItems={mockItems} htxName="HTX MD2" htxLocation="Tiền Giang" onClose={() => {}} />)
  expect(screen.getByText('DX AgriMarket')).toBeInTheDocument()
  expect(screen.getByText('HTX MD2')).toBeInTheDocument()
})

test('Sidebar renders nav items', () => {
  render(<Sidebar navItems={mockItems} onClose={() => {}} />)
  expect(screen.getByText('Dashboard')).toBeInTheDocument()
})
```

**Pass Criteria:** Brand block và nav items render đúng.

---

### TC-7.2-03: Sidebar Background Color — Desktop (E2E)

**Type:** E2E
**Tool:** Playwright
**Priority:** P0

```typescript
// tests/e2e/layout/appshell.spec.ts
test('sidebar has correct dark green background', async ({ page }) => {
  // Login as manager first
  await loginAsManager(page)
  await page.goto('/manager/dashboard')
  
  const sidebar = page.locator('[data-testid="sidebar"]')
  await expect(sidebar).toBeVisible()
  
  const bg = await sidebar.evaluate(el =>
    getComputedStyle(el).backgroundColor
  )
  // #143c2d = rgb(20, 60, 45)
  expect(bg).toBe('rgb(20, 60, 45)')
})
```

**Pass Criteria:** Sidebar background chính xác là `#143c2d`.

---

### TC-7.2-04: Active Nav Item Has Lime Indicator (E2E)

**Type:** E2E
**Tool:** Playwright
**Priority:** P1

```typescript
test('active nav item has lime left border', async ({ page }) => {
  await loginAsManager(page)
  await page.goto('/manager/dashboard')
  
  const activeItem = page.locator('nav .active').first()
  await expect(activeItem).toBeVisible()
  
  const boxShadow = await activeItem.evaluate(el =>
    getComputedStyle(el).boxShadow
  )
  expect(boxShadow).toContain('rgb(214, 240, 92)') // #d6f05c
})
```

**Pass Criteria:** Active item có lime color trong box-shadow.

---

### TC-7.2-05: Mobile Sidebar Drawer Open/Close (E2E)

**Type:** E2E
**Tool:** Playwright
**Priority:** P0

```typescript
test('mobile sidebar drawer opens and closes', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 } // iPhone 14 Pro
  })
  const page = await context.newPage()
  await loginAsManager(page)
  await page.goto('/manager/dashboard')
  
  // Sidebar should be hidden initially
  const sidebar = page.locator('[data-testid="sidebar"]')
  await expect(sidebar).not.toBeVisible()
  
  // Click hamburger button
  await page.locator('[data-testid="menu-button"]').click()
  await expect(sidebar).toBeVisible()
  
  // Click backdrop to close
  await page.locator('[data-testid="backdrop"]').click()
  await expect(sidebar).not.toBeVisible()
  
  await context.close()
})
```

**Pass Criteria:** Sidebar ẩn trên mobile, mở khi tap hamburger, đóng khi tap backdrop.

---

### TC-7.2-06: Manager Layout Not Broken (E2E)

**Type:** E2E / Regression
**Tool:** Playwright
**Priority:** P0

```typescript
test('manager layout renders without errors', async ({ page }) => {
  await loginAsManager(page)
  await page.goto('/manager/dashboard')
  
  // No console errors
  const errors: string[] = []
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  
  await expect(page.locator('main')).toBeVisible()
  expect(errors).toHaveLength(0)
})
```

**Pass Criteria:** Manager layout render bình thường, không có JS errors.

---

## Test Execution Plan

```
P0 (blocking):
  TC-7.2-01: isActive logic
  TC-7.2-03: Sidebar background color
  TC-7.2-05: Mobile drawer
  TC-7.2-06: Manager layout regression

P1 (important):
  TC-7.2-02: Brand block render
  TC-7.2-04: Lime active indicator
```

---

## Definition of Done for Story 7.2

- [ ] `TC-7.2-01` PASS: isActive unit tests
- [ ] `TC-7.2-02` PASS: Brand block renders
- [ ] `TC-7.2-03` PASS: Sidebar background đúng màu
- [ ] `TC-7.2-04` PASS: Active item có lime indicator
- [ ] `TC-7.2-05` PASS: Mobile drawer hoạt động
- [ ] `TC-7.2-06` PASS: Manager layout không bị break
- [ ] `npm run build` pass
- [ ] Committed với: `feat(layout): refactor appshell and sidebar to prototype design`

---

*🧪 Murat notes: TC-7.2-05 (mobile drawer) là test phức tạp nhất — cần mock session trước khi test. Đảm bảo có helper `loginAsManager()` trong Playwright fixtures trước khi run. TC-7.2-03 phải check computed style, không chỉ class name, vì CSS có thể bị override.*
