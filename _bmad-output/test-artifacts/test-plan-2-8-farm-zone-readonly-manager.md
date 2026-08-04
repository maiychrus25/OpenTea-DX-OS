# 🧪 Test Plan — Story 2.8: Farm Zone Readonly View

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 2.8 — Farm Zone Readonly View (Manager)
**Date:** 2026-08-05
**Risk Level:** 🟢 LOW — Read-only data display. Main risk is Prisma relational query missing data or SSR hydration error for the map.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Prisma query fails to include relations | MEDIUM | MEDIUM | Unit test `GetAllParcelsUseCase` |
| SSR hydration error for map | HIGH | HIGH | Playwright E2E test |
| Manager can accidentally edit data | LOW | CRITICAL | Code review: verify no write actions exist in UI |

---

## Test Strategy for Story 2.8

### Approach

We will unit test the Use Case to ensure it fetches the nested relations (`Household`, `ParcelCropCycle`). We will E2E test the page to ensure it renders the map and the data table without SSR errors.

**Test files location:**
- `apps/web/src/__tests__/application/useCases/`
- `apps/web/tests/e2e/zone/`

---

## Test Cases

### TC-2.8-01: GetAllParcelsUseCase Nested Relations (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P1

**Test Concept:**
Mock the repository to return a parcel that includes a household name and an active crop cycle. Verify the Use Case correctly formats or passes through this nested data.

```typescript
// __tests__/application/useCases/GetAllParcelsUseCase.test.ts
import { GetAllParcelsUseCase } from '@/application/useCases/GetAllParcelsUseCase'
import { IParcelRepository } from '@/domain/repositories/IParcelRepository'

describe('GetAllParcelsUseCase', () => {
  it('returns parcels with household and active crop', async () => {
    const mockParcels = [{
      id: 'p1',
      household: { name: 'Ông Hùng' },
      cycles: [{ crop_name: 'Lúa OM18', status: 'ACTIVE' }]
    }] as any
    
    const mockRepo: IParcelRepository = {
      getAllParcels: jest.fn().mockResolvedValue(mockParcels)
    }
    
    const useCase = new GetAllParcelsUseCase(mockRepo)
    const result = await useCase.execute()

    expect(result[0].household.name).toBe('Ông Hùng')
    expect(result[0].cycles[0].crop_name).toBe('Lúa OM18')
  })
})
```

**Pass Criteria:** Nested relations are successfully propagated.
**Fail Criteria:** Throws error or loses data.

---

### TC-2.8-02: Map & Table Rendering (E2E)

**Type:** E2E
**Tool:** Playwright
**Priority:** P0

**Test Concept:**
Login as Manager. Navigate to `/manager/zones`.
1. Assert the Data Table is visible.
2. Assert the Leaflet Map is visible.
3. Assert there are NO console errors (hydration).

**Pass Criteria:** Page renders perfectly on client load.
**Fail Criteria:** SSR error crashes page.

---

### TC-2.8-03: Read-Only Verification (Manual/Code Review)

**Type:** Manual / Code Review
**Priority:** P0

**Test Concept:**
Verify that the `page.tsx` and `ZoneMap.tsx` components do NOT import or render any mutation components (like Forms or Delete buttons).

**Pass Criteria:** Strictly read-only UI.
**Fail Criteria:** Edit buttons present.

---

## Test Execution Plan

```
P0 (blocking):
  TC-2.8-02 → TC-2.8-03
  
P1 (important):
  TC-2.8-01
```

---

## Definition of Done for Story 2.8

- [ ] `TC-2.8-01` PASS: Use case logic verified.
- [ ] `TC-2.8-02` PASS: E2E render test without SSR issues.
- [ ] `TC-2.8-03` PASS: Read-only constraint verified.
- [ ] Committed with: `feat(zone): implement readonly farm zone list and map for manager`

---

*🧪 Murat notes: Another Leaflet map, another chance for hydration errors. Pay attention to how the dynamic import is structured.*
