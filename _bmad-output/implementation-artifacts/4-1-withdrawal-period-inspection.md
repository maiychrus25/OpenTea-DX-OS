# Story 4.1: Withdrawal Period Inspection (Service)

Status: ready-for-dev

## Story

As the System,
I want to rigorously verify if a parcel has passed the required withdrawal period (thời gian cách ly) for any applied chemicals,
so that the cooperative guarantees food safety before harvesting or packing a Lot.

## Dependencies
- **Depends on:** 3.3 (Journal Entry) - requires `activity_metadata` containing `withdrawal_days`.
- **Blocks:** 4.2 (Lot Creation)

## Acceptance Criteria

1. **Given** a `Parcel` **When** its withdrawal status is evaluated **Then** the system checks all `JournalEntry` records with `activity_type = 'SPRAYING'` and `status = 'APPROVED'`.
2. **Given** a spraying journal **When** it has `withdrawal_days: N` in its metadata **Then** the safe harvest date is `recorded_date + N days`.
3. **Given** the current date **When** it is before the safe harvest date **Then** the parcel is marked as `IS_QUARANTINED` (Đang cách ly).
4. **Given** the current date **When** it is after all safe harvest dates **Then** the parcel is marked as `SAFE_FOR_HARVEST`.
5. **Given** the architecture **When** calculating this **Then** it MUST be encapsulated in a pure Domain Service (`WithdrawalInspectionService`).

## Hexagonal Architecture Design & Tasks

### 1. Domain Layer (`src/domain/`)
- [ ] **T1.1: Define Domain Service**
  - File: `src/domain/services/WithdrawalInspectionService.ts`
  - Method: `evaluateSafety(journals: JournalEntry[], currentDate: Date): { isSafe: boolean, earliestSafeDate: Date | null, reasons: string[] }`
  - Logic: 
    - Filter for `SPRAYING` activities.
    - Parse `withdrawal_days` from JSON. Add days to `recorded_date`.
    - If `currentDate < safeDate`, push to `reasons` ("Chưa hết cách ly thuốc X").

### 2. Application Layer (`src/application/`)
- [ ] **T2.1: Use Case Integration**
  - File: `src/application/useCases/inspection/CheckParcelSafetyUseCase.ts`
  - Logic: Fetch `Parcel`, fetch all `SPRAYING` journals for that parcel. Call Domain Service. Return result.

### 3. Presentation / API Layer (`src/app/api/`)
- [ ] **T3.1: API Route**
  - File: `src/app/api/parcels/[id]/safety/route.ts` (GET)
  - Execute `CheckParcelSafetyUseCase` and return the evaluation object.

## Dev Notes
- Date math in pure TS: Be careful with timezone offsets. Use UTC or standardize on `date-fns` for robust `addDays` logic.
