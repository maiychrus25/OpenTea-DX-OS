# 🧪 Test Plan — Story 3.7: Technical Announcement

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 3.7 — Technical Announcement (Farmers)
**Date:** 2026-08-05
**Risk Level:** 🟢 LOW — Standard relational data fetching and bulk inserting.

---

## Detailed Test Cases

### TC-3.7-01: Target Audience Resolution (Integration)

**Type:** Integration
**Tool:** Jest + Prisma
**Priority:** P0
**Target File:** `src/application/useCases/announcement/CreateTechnicalAnnouncementUseCase.test.ts`

**Test Setup:**
1. Seed `FarmZone` 'Z-1'.
2. Seed `Household` 'H-1' (linked to User 'U-1') with a Parcel in 'Z-1'.
3. Seed `Household` 'H-2' (linked to User 'U-2') with a Parcel in 'Z-1'.
4. Seed `Household` 'H-3' (linked to User 'U-3') with a Parcel in `FarmZone` 'Z-2'.
5. Seed `Household` 'H-4' (NO user linked) with a Parcel in 'Z-1'.

**Execution:**
1. Execute `CreateTechnicalAnnouncementUseCase` targeting 'Z-1'.

**Expected Results:**
- `INotificationRepository.createMany` MUST be called with exactly 2 notifications.
- The targets must be exactly 'U-1' and 'U-2'.
- 'U-3' is excluded (wrong zone).
- 'H-4' is safely ignored (no user account to notify).

### TC-3.7-02: Bulk Insert Performance (Integration)

**Type:** Integration
**Tool:** Jest
**Priority:** P1
**Target File:** `src/infrastructure/db/repositories/PrismaNotificationRepository.test.ts`

**Execution:**
1. Generate an array of 500 mock notification objects.
2. Call `PrismaNotificationRepository.createMany(array)`.

**Expected Results:**
- The repository must execute the insert successfully without throwing payload size errors.
- Querying the DB for the user ID must return the inserted records.

---

## Definition of Done

- [ ] `TC-3.7-01` PASS: Relational lookup perfectly targets only relevant active users.
- [ ] `TC-3.7-02` PASS: Bulk inserts handle large zone populations.
- [ ] Committed with: `feat(announcement): implement technical announcements for farm zones`
