# 🧪 Test Plan — Story 3.4: Parcel Status Auto-Derivation

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 3.4 — Parcel Status Auto-Derivation
**Date:** 2026-08-05
**Risk Level:** 🟢 LOW — Core domain logic is isolated and highly testable.

---

## Detailed Test Cases

### TC-3.4-01: Pure Domain Logic (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P0
**Target File:** `src/domain/services/ParcelStatusService.test.ts`

**Execution & Expectations:**
1. Call `determineNextStatus('RESTING', 'SOWING')`. Assert returns `'ACTIVE'`.
2. Call `determineNextStatus('ACTIVE', 'HARVESTING')`. Assert returns `'RESTING'`.
3. Call `determineNextStatus('ACTIVE', 'FERTILIZING')`. Assert returns `'ACTIVE'`.
4. Call `determineNextStatus('RESTING', 'SPRAYING')`. Assert returns `'RESTING'`.

### TC-3.4-02: Use Case Orchestration (Integration)

**Type:** Integration
**Tool:** Jest
**Priority:** P0
**Target File:** `src/application/useCases/journal/CreateJournalEntryUseCase.test.ts`

**Test Setup:**
1. Mock `IParcelRepository.findById` to return a parcel with `status: 'RESTING'`.
2. Mock `IParcelRepository.update`.

**Execution:**
1. Call `CreateJournalEntryUseCase.execute({ activity_type: 'SOWING', ... }, 'OFFICER')`. (Officer role automatically sets Journal status to `APPROVED`).

**Expected Results:**
- `IParcelRepository.update` MUST be called with `{ status: 'ACTIVE' }`.

### TC-3.4-03: Pending Journals Do Not Trigger Update (Integration)

**Type:** Integration
**Tool:** Jest
**Priority:** P0
**Target File:** `src/application/useCases/journal/CreateJournalEntryUseCase.test.ts`

**Execution:**
1. Same setup as above, but call the use case with role `FARMER` (which sets Journal status to `PENDING`).

**Expected Results:**
- `IParcelRepository.update` MUST NOT be called. The state of the parcel must remain unchanged until the Officer approves the journal (handled in Story 3.6).

---

## Definition of Done

- [ ] `TC-3.4-01` PASS: Domain service handles state machine rules perfectly.
- [ ] `TC-3.4-02` PASS: Use case orchestrates the update correctly when approved.
- [ ] `TC-3.4-03` PASS: Use case ignores state changes if journal is pending.
- [ ] Committed with: `feat(domain): implement parcel status auto derivation logic`
