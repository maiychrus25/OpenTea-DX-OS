# Story 4.1: Pre-harvest Withdrawal Inspection

Status: ready-for-dev

## Story

As a Technical Officer,
I want the system to calculate if a parcel has passed the chemical withdrawal period (thời gian cách ly) before I can harvest it,
so that I can guarantee the crop is safe for market distribution.

## Acceptance Criteria

1. **Given** a Parcel that is `ACTIVE` **When** I view its details **Then** I see the `safe_harvest_date` (Ngày an toàn thu hoạch).
2. **Given** the `safe_harvest_date` calculation **When** it is executed **Then** it finds the latest journal entry for that parcel with `activity = SPRAYING` (Phun thuốc), adds the `withdrawal_days` associated with the chemical used, and sets the safe date.
3. **Given** I am creating a "Harvesting" (Thu hoạch) journal entry **When** the current date is BEFORE the `safe_harvest_date` **Then** the system blocks the creation and shows an error: "Chưa hết thời gian cách ly."
4. **Given** no spraying journals exist for the current crop cycle **When** the calculation runs **Then** the `safe_harvest_date` is null (safe to harvest anytime).

## Tasks / Subtasks

- [ ] **T1: Define Domain Logic**
  - [ ] Create `src/domain/services/WithdrawalCalculationService.ts`.
  - [ ] Implement `calculateSafeHarvestDate(journals: JournalEntry[]): Date | null`.

- [ ] **T2: Update CreateJournalEntryUseCase**
  - [ ] Inject `WithdrawalCalculationService`.
  - [ ] If the new entry is `activity === HARVESTING`, fetch past journals for the current cycle.
  - [ ] Calculate the safe date. If `new Date() < safeDate`, throw a `ValidationError` ("Chưa hết thời gian cách ly").

- [ ] **T3: Validate & Commit**
  - [ ] Write unit tests for `WithdrawalCalculationService`.
  - [ ] Commit: `feat(traceability): implement pre-harvest withdrawal inspection logic`

## Dev Notes

- **Data structure:** The `JournalEntry` table has a JSONB field `activity_metadata` which contains `chemical_name` and `withdrawal_days`. The Domain logic must parse this JSON to find the days.
