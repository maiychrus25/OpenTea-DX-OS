# 🧪 Test Plan — Story 6.4: HTX Capability Profile Page

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 6.4 — HTX Capability Profile Page
**Date:** 2026-08-05
**Risk Level:** 🟢 LOW — Standard read-only aggregation.

---

## Test Cases

### TC-6.4-01: Aggregate Math (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P1

**Test Concept:**
Mock the database returns for parcels. Ensure `GetPublicHTXProfileUseCase` correctly sums the `area_m2` across all active parcels and returns the correct total.

### TC-6.4-02: Public Accessibility (Integration)

**Type:** Integration
**Tool:** Jest
**Priority:** P0

**Test Concept:**
Ensure the `/htx` route (and its data fetching use case) does NOT require a Keycloak session and responds with a 200 OK.

---

## Definition of Done

- [ ] `TC-6.4-01` PASS: Aggregations calculate correctly.
- [ ] `TC-6.4-02` PASS: Page is publicly accessible.
- [ ] Committed with: `feat(marketing): implement public htx capability profile page`
