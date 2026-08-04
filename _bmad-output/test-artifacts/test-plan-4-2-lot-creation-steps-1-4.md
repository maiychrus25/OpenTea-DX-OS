# 🧪 Test Plan — Story 4.2: Lot Creation Wizard

**Authored by:** Murat (Master Test Architect)
**Story:** 4.2

---

## Detailed Test Cases

### TC-4.2-01: Server-Side Safety Enforcement (Integration)

**Type:** Integration
**Tool:** Jest
**Target:** `src/application/useCases/lot/CreateDraftLotUseCase.test.ts`

**Execution:**
1. Seed a parcel that fails the safety inspection.
2. Attempt to create a Lot via the Use Case including that `parcel_id`.
3. Assert the Use Case throws a Domain Error and prevents creation (do not trust the client UI).

### TC-4.2-02: Wizard UI Flow (E2E)

**Type:** E2E
**Tool:** Playwright
**Target:** `tests/e2e/lot/lot-wizard.spec.ts`

**Execution:**
1. Login as Officer. Navigate to `/officer/lots/new`.
2. Fill Step 1, click Next.
3. Assert Step 2 shows a disabled checkbox for a quarantined parcel. Check a valid parcel. Click Next.
4. Complete form. Submit.
5. Assert success toast and redirect to `/officer/lots`.
