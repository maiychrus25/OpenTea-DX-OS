# 🧪 Test Plan — Story 3.3: Journal Entry

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 3.3 — Journal Entry (Officer Self Record)
**Date:** 2026-08-05
**Risk Level:** 🟡 MEDIUM — Conditional metadata schema validation based on activity type.

---

## Detailed Test Cases

### TC-3.3-01: Auto-Approval by Role (Integration)

**Type:** Integration
**Tool:** Jest
**Priority:** P0
**Target File:** `src/application/useCases/journal/CreateJournalEntryUseCase.test.ts`

**Execution:**
1. Instantiate `CreateJournalEntryUseCase` with a mock repository.
2. Call `useCase.execute({ ...payload }, 'OFFICER')`.
3. Assert that the `IJournalRepository.create` method was called with `status: 'APPROVED'`.
4. Call `useCase.execute({ ...payload }, 'FARMER')`.
5. Assert that the method was called with `status: 'PENDING'`.

### TC-3.3-02: Conditional Metadata Validation (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P1
**Target File:** `src/domain/schemas/journalSchema.test.ts`

**Test Setup & Execution:**
1. **Case A:** Test `journalSchema.parse` with `activity_type = 'SOWING'` and `activity_metadata = {}`. Expect PASS.
2. **Case B:** Test with `activity_type = 'SPRAYING'` and missing `activity_metadata.withdrawal_days`. Expect FAIL (Zod error).
3. **Case C:** Test with `activity_type = 'SPRAYING'` and valid metadata. Expect PASS.
*Note: Use `z.discriminatedUnion` or `.superRefine` in Zod to enforce this.*

### TC-3.3-03: Form Rendering Conditional Logic (Unit/Component)

**Type:** Unit
**Tool:** React Testing Library (RTL) + Jest
**Priority:** P1
**Target File:** `src/components/features/journal/JournalForm.test.tsx`

**Execution:**
1. Render `<JournalForm />`.
2. Find the `<select>` for Activity Type.
3. Assert that the "Tên thuốc" and "Thời gian cách ly" inputs are NOT in the document.
4. Fire event: change the select value to `SPRAYING`.
5. Assert that the "Tên thuốc" and "Thời gian cách ly" inputs APPEAR in the document.

---

## Definition of Done

- [ ] `TC-3.3-01` PASS: Role-based status derivation works perfectly.
- [ ] `TC-3.3-02` PASS: Zod strictly validates Spraying metadata.
- [ ] `TC-3.3-03` PASS: Form reacts to selected activity type dynamically.
- [ ] Committed with: `feat(journal): implement dynamic journal form and officer creation`
