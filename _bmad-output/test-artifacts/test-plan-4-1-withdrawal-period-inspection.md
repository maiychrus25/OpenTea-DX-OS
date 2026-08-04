# 🧪 Test Plan — Story 4.1: Withdrawal Period Inspection

**Authored by:** Murat (Master Test Architect)
**Story:** 4.1

---

## Detailed Test Cases

### TC-4.1-01: Pure Mathematical Safety (Unit)

**Type:** Unit
**Tool:** Jest
**Target:** `src/domain/services/WithdrawalInspectionService.test.ts`

**Execution:**
1. Mock a journal `recorded_date = '2023-10-01'`, `withdrawal_days = 10`.
2. Call `evaluateSafety` with `currentDate = '2023-10-05'`. Assert `isSafe = false`, `earliestSafeDate = '2023-10-11'`.
3. Call with `currentDate = '2023-10-12'`. Assert `isSafe = true`.

### TC-4.1-02: Multiple Overlapping Chemicals (Unit)

**Type:** Unit
**Tool:** Jest

**Execution:**
1. Pass two journals: Chemical A (applied Oct 1, wait 5 days -> Safe Oct 6), Chemical B (applied Oct 2, wait 10 days -> Safe Oct 12).
2. Call with `currentDate = '2023-10-08'`. Assert `isSafe = false` (A is safe, but B is not).
3. Assert `reasons` array correctly identifies Chemical B.
