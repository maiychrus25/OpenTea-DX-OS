# 🧪 Test Plan — Story 3.6: Batch Journal Approval

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 3.6 — Batch Journal Approval (Officer)
**Date:** 2026-08-05
**Risk Level:** 🔴 HIGH — Mass database mutations and transaction boundaries.

---

## Detailed Test Cases

### TC-3.6-01: Transactional Safety (Integration)

**Type:** Integration
**Tool:** Jest
**Priority:** P0
**Target File:** `src/application/useCases/journal/BatchReviewJournalsUseCase.test.ts`

**Test Setup:**
1. Seed the DB with 3 `JournalEntry` records in `PENDING` state, belonging to 3 different `Parcel` records.
2. Mock the `ParcelStatusService` to intentionally throw an error when processing the 2nd journal (to simulate a mid-batch failure).

**Execution:**
1. Call `BatchReviewJournalsUseCase.execute` with the 3 journal IDs and `action: 'APPROVE'`.
2. Catch the resulting error.

**Expected Results:**
- The transaction MUST roll back.
- Query the database: All 3 `JournalEntry` records must remain `PENDING`.
- All 3 `Parcel` records must remain unchanged.

### TC-3.6-02: Parcel Status Orchestration in Batch (Integration)

**Type:** Integration
**Tool:** Jest
**Priority:** P0

**Test Setup:**
1. Seed `Parcel` 'A' (RESTING) with a PENDING `SOWING` journal.
2. Seed `Parcel` 'B' (ACTIVE) with a PENDING `HARVESTING` journal.
3. Seed `Parcel` 'C' (RESTING) with a PENDING `SPRAYING` journal.

**Execution:**
1. Execute the batch Use Case with `action: 'APPROVE'` for all 3 journals.

**Expected Results:**
- Parcel A becomes `ACTIVE`.
- Parcel B becomes `RESTING`.
- Parcel C remains `RESTING`.
- All 3 journals become `APPROVED`.

### TC-3.6-03: UI Batch Selection (Unit / Component)

**Type:** Unit
**Tool:** Jest + RTL
**Priority:** P1
**Target File:** `src/app/(officer)/approvals/_components/ApprovalTable.test.tsx`

**Execution:**
1. Render `<ApprovalTable />` with mock data (3 rows).
2. Check the "Select All" checkbox in the header.
3. Assert that all 3 row checkboxes are automatically checked.
4. Uncheck row 2.
5. Click the "Duyệt đã chọn" button.
6. Assert that the `fetch` API is called with exactly the IDs of row 1 and row 3.

---

## Definition of Done

- [ ] `TC-3.6-01` PASS: Batch fails gracefully without corrupting partial data.
- [ ] `TC-3.6-02` PASS: Parcels update correctly based on domain logic in batch.
- [ ] `TC-3.6-03` PASS: Table UI handles multi-select accurately.
- [ ] Committed with: `feat(journal): implement batch approval with transaction safety`
