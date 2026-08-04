# 🧪 Test Plan — Story 5.1: Today Dashboard

**Authored by:** Murat (Master Test Architect)
**Story:** 5.1

---

## Detailed Test Cases

### TC-5.1-01: Role Dashboards Render (E2E)
**Type:** E2E
**Tool:** Playwright
**Target File:** `tests/e2e/dashboard/dashboards.spec.ts`
**Execution:**
1. Login as Farmer. Navigate to `/farmer`. Assert `.weather-widget` is visible.
2. Login as Officer. Navigate to `/officer`. Assert `.pending-widget` is visible.
3. Login as Manager. Navigate to `/manager`. Assert `.market-widget` is visible.

### TC-5.1-02: Widget Data Fetching (Unit)
**Type:** Unit
**Tool:** Jest
**Target File:** `src/application/useCases/dashboard/GetOfficerDashboardUseCase.test.ts`
**Execution:**
1. Mock Prisma `journalEntry.count` to return `5`.
2. Call `GetOfficerDashboardUseCase.execute()`.
3. Assert it returns exactly `{ pendingCount: 5 }`.
