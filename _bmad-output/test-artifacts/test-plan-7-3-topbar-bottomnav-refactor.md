# 🧪 Test Plan — Story 7.3: TopBar & BottomNav Refactor

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 7.3 — TopBar & BottomNav Refactor — Prototype Design
**Date:** 2026-08-14
**Risk Level:** 🟡 MEDIUM — Layout components ảnh hưởng UX mobile. Rủi ro: hamburger không kết nối được với sidebar drawer từ story 7-2, BottomNav active state sai.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `onMenuOpen` prop không kết nối đúng → hamburger không mở sidebar | MEDIUM | HIGH | Integration test với AppShell |
| BottomNav hiện trên desktop | LOW | MEDIUM | E2E desktop viewport check |
| Search input hiện trên mobile | LOW | MEDIUM | E2E mobile viewport check |
| BottomNav active state sai | LOW | MEDIUM | Unit test với mock pathname |

---

## Test Cases

### TC-7.3-01: TopBar Search Hidden on Mobile (E2E)

**Type:** E2E
**Tool:** Playwright — mobile viewport 390px
**Priority:** P1

```typescript
test('search input is hidden on mobile', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await loginAsManager(page)
  await page.goto('/manager/dashboard')
  await expect(page.locator('.search-wrap')).not.toBeVisible()
  await ctx.close()
})
```

---

### TC-7.3-02: Hamburger Visible on Mobile (E2E)

**Type:** E2E
**Tool:** Playwright — mobile viewport
**Priority:** P0

```typescript
test('hamburger button visible on mobile, hidden on desktop', async ({ browser }) => {
  // Desktop
  const ctxDesktop = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const pageDesktop = await ctxDesktop.newPage()
  await loginAsManager(pageDesktop)
  await pageDesktop.goto('/manager/dashboard')
  await expect(pageDesktop.locator('[data-testid="menu-button"]')).not.toBeVisible()
  await ctxDesktop.close()

  // Mobile
  const ctxMobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const pageMobile = await ctxMobile.newPage()
  await loginAsManager(pageMobile)
  await pageMobile.goto('/manager/dashboard')
  await expect(pageMobile.locator('[data-testid="menu-button"]')).toBeVisible()
  await ctxMobile.close()
})
```

---

### TC-7.3-03: Hamburger Click Triggers Sidebar Open (E2E Integration)

**Type:** E2E Integration (7-2 + 7-3)
**Tool:** Playwright
**Priority:** P0

```typescript
test('hamburger click opens sidebar drawer', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await loginAsManager(page)
  await page.goto('/manager/dashboard')
  await page.locator('[data-testid="menu-button"]').click()
  await expect(page.locator('[data-testid="sidebar"]')).toBeVisible()
  await ctx.close()
})
```

---

### TC-7.3-04: BottomNav Hidden on Desktop (E2E)

**Type:** E2E
**Tool:** Playwright — desktop 1280px
**Priority:** P1

```typescript
test('bottom nav is hidden on desktop', async ({ page }) => {
  await loginAsManager(page) // default desktop viewport
  await page.goto('/manager/dashboard')
  await expect(page.locator('[data-testid="bottom-nav"]')).not.toBeVisible()
})
```

---

### TC-7.3-05: BottomNav Shows Max 4 Items on Mobile (E2E)

**Type:** E2E
**Tool:** Playwright — mobile viewport
**Priority:** P1

```typescript
test('bottom nav shows max 4 items on mobile', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await loginAsManager(page)
  await page.goto('/manager/dashboard')
  const items = page.locator('[data-testid="bottom-nav"] button')
  await expect(items).toHaveCount(4)
  await ctx.close()
})
```

---

## Test Execution Plan

```
P0 (blocking):
  TC-7.3-02: Hamburger visibility
  TC-7.3-03: Hamburger → sidebar integration

P1 (important):
  TC-7.3-01: Search hidden mobile
  TC-7.3-04: BottomNav hidden desktop
  TC-7.3-05: BottomNav max 4 items
```

---

## Definition of Done for Story 7.3

- [ ] `TC-7.3-02` PASS: Hamburger visibility correct
- [ ] `TC-7.3-03` PASS: Hamburger triggers sidebar open
- [ ] `TC-7.3-01` PASS: Search hidden on mobile
- [ ] `TC-7.3-04` PASS: BottomNav hidden desktop
- [ ] `TC-7.3-05` PASS: BottomNav 4 items max
- [ ] `npm run build` pass
- [ ] Committed với: `feat(layout): refactor topbar and bottomnav to prototype design`

---

*🧪 Murat notes: TC-7.3-03 là integration test phụ thuộc story 7-2. Chỉ chạy sau khi 7-2 đã merged. Nếu 7-2 chưa xong, skip TC-7.3-03 và note lại trong CI.*
