# 🧪 Test Plan — Story 4.1: Pre-harvest Withdrawal Inspection

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 4.1 — Pre-harvest Withdrawal Inspection
**Date:** 2026-08-05
**Risk Level:** 🔴 HIGH — Food safety feature. If this logic fails, contaminated crops could be harvested and distributed, violating the core value prop of the traceability system.

---

## Test Cases

### TC-4.1-01: Withdrawal Date Calculation (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P0

**Test Concept:**
Test `WithdrawalCalculationService.calculateSafeHarvestDate()`.
1. Pass journals with no `SPRAYING` -> Returns `null`.
2. Pass one `SPRAYING` journal with `withdrawal_days: 14` on `2026-08-01` -> Returns `2026-08-15`.
3. Pass multiple `SPRAYING` journals -> Returns the latest safe date among all of them.

### TC-4.1-02: Harvest Blocking (Integration)

**Type:** Integration
**Tool:** Jest
**Priority:** P0

**Test Concept:**
Mock the service to return a safe date of tomorrow. Send a POST request to `/api/journals` with `activity: 'HARVESTING'`. Assert it returns a 400 Bad Request with a clear message.

---

## Definition of Done

- [ ] `TC-4.1-01` PASS: Calculation math is correct.
- [ ] `TC-4.1-02` PASS: API route blocks early harvesting.
- [ ] Committed with: `feat(traceability): implement pre-harvest withdrawal inspection logic`
