# 🧪 Test Plan — Story 7.9: Public QR Trace Page

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 7.9 — Public QR Trace Page `/lot/[lot_code]`
**Date:** 2026-08-14
**Risk Level:** 🔴 HIGH — Public page không cần auth; compliance critical (disclaimer MANDATORY); withdrawal logic ảnh hưởng food safety.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Middleware chặn public route → 401 redirect | MEDIUM | CRITICAL | E2E without auth session |
| Disclaimer bị thiếu | LOW | CRITICAL | E2E text assertion (MANDATORY) |
| Withdrawal check logic sai | MEDIUM | CRITICAL | Unit test với date mock |
| `notFound()` không trigger → blank page | LOW | HIGH | E2E: invalid lot_code → 404 |
| Next.js 14 sync params vs async | MEDIUM | HIGH | TypeScript: `params: { lot_code: string }` |
| MinIO pre-signed URL exposed client-side | LOW | CRITICAL | Code review: no direct MinIO SDK in component |

---

## Test Cases

### TC-7.9-01: Page Accessible Without Auth (E2E — Critical)

**Type:** E2E — No auth session
**Tool:** Playwright
**Priority:** P0 — CRITICAL

```typescript
test('trace page accessible without login', async ({ browser }) => {
  // New context with no auth cookies
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('/lot/LOT-2026-001')
  // Should NOT redirect to /login
  await expect(page).not.toHaveURL(/login/)
  // Page should render some content
  await expect(page.locator('main')).toBeVisible()
  await ctx.close()
})
```

---

### TC-7.9-02: 404 for Invalid Lot Code (E2E)

**Type:** E2E
**Tool:** Playwright
**Priority:** P0

```typescript
test('invalid lot_code returns 404 page', async ({ page }) => {
  await page.goto('/lot/INVALID-CODE-9999')
  await expect(page).toHaveURL(/lot\/INVALID/)
  // Next.js not-found page
  await expect(page.getByText(/không tìm thấy|not found/i)).toBeVisible()
})
```

---

### TC-7.9-03: Disclaimer Present (E2E — Compliance)

**Type:** E2E
**Tool:** Playwright
**Priority:** P0 — MANDATORY

```typescript
test('disclaimer text is visible on trace page', async ({ page }) => {
  // Use a seeded lot_code from test DB
  await page.goto('/lot/TEST-LOT-001')
  await expect(page.getByText(/DX AgriMarket không chỉnh sửa/)).toBeVisible()
})
```

---

### TC-7.9-04: Withdrawal Safety Check Logic (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P0 — Food safety critical

```typescript
import { isHarvestSafe } from '../utils/withdrawal'

describe('isHarvestSafe()', () => {
  it('returns true when safe_harvest_date is in the past', () => {
    const pastDate = new Date('2020-01-01')
    expect(isHarvestSafe(pastDate)).toBe(true)
  })

  it('returns false when safe_harvest_date is in the future', () => {
    const futureDate = new Date(Date.now() + 86400000 * 30)
    expect(isHarvestSafe(futureDate)).toBe(false)
  })

  it('returns false when null', () => {
    expect(isHarvestSafe(null)).toBe(false)
  })
})
```

---

### TC-7.9-05: SEO Metadata Present (E2E)

**Type:** E2E
**Tool:** Playwright
**Priority:** P1

```typescript
test('trace page has SEO title', async ({ page }) => {
  await page.goto('/lot/TEST-LOT-001')
  const title = await page.title()
  expect(title).toContain('Truy xuất')
  expect(title).toContain('DX AgriMarket')
})
```

---

### TC-7.9-06: Safety Pill Shows Correct Tone (E2E)

**Type:** E2E
**Tool:** Playwright
**Priority:** P1

```typescript
test('safety pill shows green for safe lot', async ({ page }) => {
  // Seed a lot with past safe_harvest_date
  await page.goto('/lot/SAFE-LOT-001')
  await expect(page.getByText('An toàn')).toBeVisible()
})
```

---

## Test Execution Plan

```
P0 (blocking — food safety + compliance):
  TC-7.9-01: No-auth accessibility
  TC-7.9-02: 404 handling
  TC-7.9-03: Disclaimer (MANDATORY)
  TC-7.9-04: Withdrawal logic unit

P1 (important):
  TC-7.9-05: SEO metadata
  TC-7.9-06: Safety pill tone
```

---

## Definition of Done for Story 7.9

- [ ] `TC-7.9-01` PASS: Page accessible without auth
- [ ] `TC-7.9-02` PASS: 404 for invalid lot code
- [ ] `TC-7.9-03` PASS: Disclaimer visible (MANDATORY)
- [ ] `TC-7.9-04` PASS: Withdrawal check unit tests
- [ ] `TC-7.9-05` PASS: SEO title
- [ ] `TC-7.9-06` PASS: Safety pill correct tone
- [ ] `npm run build` pass
- [ ] Middleware verified: `/lot/:path*` is public
- [ ] Committed với: `feat(public): implement QR traceability page for lot lookup`

---

*🧪 Murat notes: TC-7.9-01 là test quan trọng nhất — đây là public consumer-facing page. Nếu middleware block nó thì QR scan sẽ fail hoàn toàn. TC-7.9-03 (disclaimer) và TC-7.9-04 (withdrawal) là food safety compliance — absolute P0 gates.*
