# 🧪 Test Plan — Story 5.2: Farmer Journal Self-Submission

**Authored by:** Murat
**Story:** 5.2

---

## Detailed Test Cases

### TC-5.2-01: Cross-Household Write Prevention (Integration)
**Type:** Integration
**Tool:** Jest
**Target File:** `src/app/api/journals/route.test.ts`
**Execution:**
1. Mock `getServerSession` returning Farmer A (owns Parcel X).
2. POST to `/api/journals` trying to create an entry for Parcel Y (owned by Farmer B).
3. Assert API returns `403 Forbidden`.

### TC-5.2-02: Farmer Pending Status (Integration)
**Type:** Integration
**Tool:** Jest
**Execution:**
1. Farmer POSTs valid journal.
2. Assert DB record is created with `status: 'PENDING'`.

### TC-5.2-03: Mobile Touch Targets (Unit/E2E)
**Type:** Unit
**Tool:** Jest/RTL
**Execution:**
Verify CSS class definitions for inputs contain properties ensuring mobile tap size (this can be statically checked or visually verified in Playwright via bounding box assertions).
