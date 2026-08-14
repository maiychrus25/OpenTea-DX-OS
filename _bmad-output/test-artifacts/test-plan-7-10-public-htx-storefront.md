# 🧪 Test Plan — Story 7.10: Public HTX Storefront

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 7.10 — Public HTX Storefront `/htx/[slug]`
**Date:** 2026-08-14
**Risk Level:** 🟡 MEDIUM — Public page, tương tự story 7-9. Rủi ro: schema thiếu `slug` field, stats query sai.

---

## Test Cases

### TC-7.10-01: Storefront Accessible Without Auth (E2E — Critical)

```typescript
test('htx storefront accessible without login', async ({ browser }) => {
  const ctx = await browser.newContext() // no auth
  const page = await ctx.newPage()
  await page.goto('/htx/htx-md2-tien-giang')
  await expect(page).not.toHaveURL(/login/)
  await expect(page.locator('main')).toBeVisible()
  await ctx.close()
})
```
**Priority:** P0

---

### TC-7.10-02: 404 for Unknown Slug (E2E)

```typescript
test('unknown htx slug shows 404', async ({ page }) => {
  await page.goto('/htx/unknown-htx-9999')
  await expect(page.getByText(/không tìm thấy|not found/i)).toBeVisible()
})
```
**Priority:** P0

---

### TC-7.10-03: HTX Name and Stats Visible (E2E)

```typescript
test('storefront shows htx name and stats', async ({ page }) => {
  await page.goto('/htx/htx-md2-tien-giang') // seeded test data
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText(/hộ nông dân/i)).toBeVisible()
  await expect(page.getByText(/ha/i)).toBeVisible()
})
```
**Priority:** P1

---

### TC-7.10-04: Lot List Renders Ready Lots (E2E)

```typescript
test('storefront shows ready lots', async ({ page }) => {
  await page.goto('/htx/htx-md2-tien-giang')
  // Should have at least one lot card if seeded data exists
  const lotCards = page.locator('[data-testid="lot-card"]')
  // If no data, empty state should show
  const count = await lotCards.count()
  if (count > 0) {
    await expect(lotCards.first()).toBeVisible()
  } else {
    await expect(page.getByText(/chưa có lô hàng/i)).toBeVisible()
  }
})
```
**Priority:** P1

---

### TC-7.10-05: SEO Metadata (E2E)

```typescript
test('storefront has SEO title with htx name', async ({ page }) => {
  await page.goto('/htx/htx-md2-tien-giang')
  const title = await page.title()
  expect(title).toContain('HTX')
  expect(title).toContain('DX AgriMarket')
})
```
**Priority:** P1

---

## Test Execution Plan

```
P0 (blocking):
  TC-7.10-01: No-auth access
  TC-7.10-02: 404 handling

P1 (important):
  TC-7.10-03: HTX stats
  TC-7.10-04: Lot list
  TC-7.10-05: SEO
```

---

## Definition of Done for Story 7.10

- [ ] `TC-7.10-01` PASS: No-auth access
- [ ] `TC-7.10-02` PASS: 404 for unknown slug
- [ ] `TC-7.10-03` PASS: Stats visible
- [ ] `TC-7.10-04` PASS: Lot list renders
- [ ] `TC-7.10-05` PASS: SEO title
- [ ] Middleware: `/htx/:path*` confirmed public
- [ ] `npm run build` pass
- [ ] Committed với: `feat(public): implement htx capability storefront page`
