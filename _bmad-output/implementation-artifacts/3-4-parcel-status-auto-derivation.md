# Story 3.4: Parcel Status Auto-Derivation (Domain Logic)

Status: ready-for-dev

## Story

As the System,
I want to automatically calculate the status of a parcel (ACTIVE, RESTING) based on its journal history,
so that the dashboard accurately reflects which lands are currently producing crops without manual data entry.

## Dependencies
- **Depends on:** 3.3
- **Blocks:** 3.6

## Acceptance Criteria

1. **Given** a new Journal Entry **When** it is saved with `status = APPROVED` **Then** a Domain Service evaluates the new state of the `Parcel`.
2. **Given** a Journal Entry with activity `SOWING` (Xuống giống) **When** approved **Then** the `Parcel` status changes to `ACTIVE`.
3. **Given** a Journal Entry with activity `HARVESTING` (Thu hoạch) **When** approved **Then** the `Parcel` status changes to `RESTING` (Nghỉ vụ).
4. **Given** the Hexagonal architecture **When** implementing this logic **Then** it MUST be contained in a pure Domain Service (`ParcelStatusService`), fully separated from the database and infrastructure layers, making it easy to Unit Test.

## Hexagonal Architecture Design & Tasks

### 1. Domain Layer (`src/domain/`)
- [ ] **T1.1: Define Domain Service**
  - File: `src/domain/services/ParcelStatusService.ts`
  - Implementation: Create a pure TypeScript class/function.
    - Method: `determineNextStatus(currentStatus: string, journalActivity: string): string`
    - Logic:
      - If `journalActivity === 'SOWING'`, return `'ACTIVE'`.
      - If `journalActivity === 'HARVESTING'`, return `'RESTING'`.
      - Otherwise, return `currentStatus`.
- [ ] **T1.2: Enums Definition**
  - File: `src/domain/enums/index.ts` (or within schema)
  - Define `ParcelStatus = { ACTIVE: 'ACTIVE', RESTING: 'RESTING' }`.
  - Define `JournalActivity = { SOWING: 'SOWING', HARVESTING: 'HARVESTING', ... }`.

### 2. Application Layer (`src/application/`)
- [ ] **T2.1: Orchestrate in Use Case**
  - File: `src/application/useCases/journal/CreateJournalEntryUseCase.ts` (Update from Story 3.3).
  - Logic:
    1. Check if the newly created Journal Entry has `status === 'APPROVED'`.
    2. If YES, fetch the current `Parcel` via `IParcelRepository.findById(data.parcel_id)`.
    3. Calculate the new status: `const newStatus = ParcelStatusService.determineNextStatus(parcel.status, data.activity_type)`.
    4. If `newStatus !== parcel.status`, call `IParcelRepository.update(parcel.id, { status: newStatus })`.

### 3. Infrastructure Layer
- [ ] **T3.1: Transaction Guarantee**
  - Note: Since we are updating the Journal Entry and potentially the Parcel in the same logical flow, ensure the Use Case uses a Prisma Transaction if possible (by passing a transaction context down via the repository ports), OR accept that eventual consistency is okay for this MVP. For this project, standard sequential `await` is acceptable for MVP, but a note should be left for future transactional boundaries.

## Dev Notes
- **Pure Logic:** Do NOT import `PrismaClient` or any `Repository` into `ParcelStatusService.ts`. It must be a pure function that takes primitive strings/enums and returns a string/enum.
