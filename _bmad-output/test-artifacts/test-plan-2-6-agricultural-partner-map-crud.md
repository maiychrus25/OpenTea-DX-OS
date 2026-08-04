# 🧪 Test Plan — Story 2.6: Agricultural Partner Map

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 2.6 — Agricultural Partner Map (CRUD)
**Date:** 2026-08-05
**Risk Level:** 🟡 MEDIUM — Map components are notorious for SSR hydration errors. CRUD logic is standard but needs RBAC verification.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| SSR Hydration error `window is not defined` | HIGH | HIGH | E2E or Integration test rendering the page |
| Unauthorized role creates a partner | LOW | HIGH | API route integration tests |
| Invalid Lat/Lng crashes map | MEDIUM | MEDIUM | Zod schema validation (-90 to 90, -180 to 180) |

---

## Test Strategy for Story 2.6

### Approach

1. **Unit (Schema):** Test Zod validation for coordinates.
2. **Integration (API):** Test RBAC on the POST/PUT endpoints.
3. **E2E (Playwright):** Load the page to ensure Leaflet renders without throwing Next.js SSR errors.

**Test files location:**
- `apps/web/src/__tests__/domain/schemas/`
- `apps/web/src/__tests__/presentation/api/`
- `apps/web/tests/e2e/map/`

---

## Test Cases

### TC-2.6-01: Coordinate Validation (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P1

**Test Concept:**
Test `partnerSchema.ts` to ensure `lat` is between -90 and 90, and `lng` is between -180 and 180.

**Pass Criteria:** Invalid coordinates are rejected.
**Fail Criteria:** Accepts lat=100.

### TC-2.6-02: Map SSR Hydration (E2E)

**Type:** E2E
**Tool:** Playwright
**Priority:** P0

**Test Concept:**
Login as Manager. Navigate to `/manager/partners`. Assert that the map container (`.leaflet-container`) is visible and no console errors are thrown regarding hydration or `window`.

```typescript
// tests/e2e/map/partner-map.spec.ts
import { test, expect } from '@playwright/test'

test('map renders without SSR errors', async ({ page }) => {
  await loginAs(page, 'MANAGER')
  
  // Listen for console errors
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  
  await page.goto('/manager/partners')
  
  await expect(page.locator('.leaflet-container')).toBeVisible()
  
  // SSR hydration errors usually throw at the page level
  expect(errors.filter(e => e.includes('window is not defined') || e.includes('hydration'))).toHaveLength(0)
})
```

**Pass Criteria:** Map renders cleanly.
**Fail Criteria:** Page crashes or throws SSR warnings.

### TC-2.6-03: API RBAC Protection (Integration)

**Type:** Integration
**Tool:** Jest
**Priority:** P0

**Test Concept:**
Mock session as `OFFICER`. Send `POST /api/partners`. Expect 403 Forbidden.

**Pass Criteria:** Request rejected.
**Fail Criteria:** Request allowed.

---

## Test Execution Plan

```
P0: TC-2.6-02 → TC-2.6-03
P1: TC-2.6-01
```

---

## Definition of Done for Story 2.6

- [ ] `TC-2.6-01` PASS: Zod schema verified.
- [ ] `TC-2.6-02` PASS: Leaflet map dynamic import working.
- [ ] `TC-2.6-03` PASS: Write APIs are protected.
- [ ] Committed with: `feat(map): implement partner map and crud management`

---

*🧪 Murat notes: The SSR hydration error is the classic Leaflet + Next.js trap. If `TC-2.6-02` passes, the hardest part of this story is done.*
