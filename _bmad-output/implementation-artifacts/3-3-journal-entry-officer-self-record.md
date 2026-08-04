# Story 3.3: Journal Entry (Officer Self Record)

Status: ready-for-dev

## Story

As a Technical Officer,
I want to be able to create a journal entry (ghi nhật ký) for any parcel in the cooperative,
so that I can help farmers who are unable to use the app to record their farming activities.

## Dependencies
- **Depends on:** 3.2
- **Blocks:** 3.4, 3.5, 3.6, 4.1, 5.2

## Acceptance Criteria

1. **Given** I am logged in as an Officer **When** I navigate to `/officer/journal/new` **Then** I see a form to create a new `JournalEntry`.
2. **Given** the journal form **When** I open it **Then** I must select a specific `Parcel` from a dropdown before proceeding. The dropdown fetches data from the API.
3. **Given** the form **When** I fill in the date, activity type (e.g., SOWING, FERTILIZING, SPRAYING, HARVESTING), and notes **Then** I can submit the form.
4. **Given** a submitted form **When** the backend receives the request **Then** it evaluates the user's role. Because an Officer created it, the system forces the `status` of the `JournalEntry` to `APPROVED` automatically.
5. **Given** the database **When** a journal entry is created **Then** the `weather_cache_id` is left `null` for now (this will be handled in Story 3.5).

## Hexagonal Architecture Design & Tasks

### 1. Domain Layer (`src/domain/`)
- [ ] **T1.1: Define Zod Schema**
  - File: `src/domain/schemas/journalSchema.ts`
  - Implementation:
    - `parcel_id`: string (UUID).
    - `activity_type`: enum `['SOWING', 'FERTILIZING', 'SPRAYING', 'HARVESTING', 'OTHER']`.
    - `recorded_date`: date string.
    - `notes`: string optional.
    - `activity_metadata`: optional JSON object (e.g. `{ chemical_name: string, withdrawal_days: number }` for SPRAYING).
- [ ] **T1.2: Define Entity**
  - File: `src/domain/entities/JournalEntry.ts`
  - Ensure it tracks `status: 'PENDING' | 'APPROVED' | 'REJECTED'`.
- [ ] **T1.3: Define Repository Port**
  - File: `src/domain/ports/IJournalRepository.ts`
  - Define `create(data)` and `findByParcel(parcelId)`.

### 2. Infrastructure Layer (`src/infrastructure/`)
- [ ] **T2.1: Implement Repository**
  - File: `src/infrastructure/db/repositories/PrismaJournalRepository.ts`
  - Wrap `prisma.journalEntry.create`.

### 3. Application Layer (`src/application/`)
- [ ] **T3.1: Create Use Case**
  - File: `src/application/useCases/journal/CreateJournalEntryUseCase.ts`
  - Logic: 
    1. Validate input against `journalSchema`.
    2. Check the `userRole` passed to the use case. If `userRole === 'OFFICER'`, set `status = 'APPROVED'`. If `userRole === 'FARMER'`, set `status = 'PENDING'`.
    3. Call `IJournalRepository.create()`.

### 4. Presentation / API Layer (`src/app/api/`)
- [ ] **T4.1: API Route**
  - File: `src/app/api/journals/route.ts` (POST)
  - Extract session. Get `session.user.role`.
  - Instantiate `CreateJournalEntryUseCase`, pass the payload and the role.

### 5. Frontend UI Layer (`src/app/(officer)/`)
- [ ] **T5.1: Shared Journal Form Component**
  - File: `src/components/features/journal/JournalForm.tsx` (Client Component)
  - This form will be shared with the Farmer in Epic 5. Design it to be highly responsive and mobile-friendly.
  - Use `react-hook-form` + `zodResolver`.
  - Fetch the list of parcels via SWR (`/api/parcels`) to populate the `parcel_id` dropdown.
- [ ] **T5.2: Officer Page**
  - File: `src/app/(officer)/journal/new/page.tsx`
  - Render the `<JournalForm />`.

## Dev Notes
- **Activity Metadata:** The `activity_metadata` JSON field is crucial for Story 4.1 (Withdrawal inspection). The frontend form must conditionally show inputs for "Tên thuốc" (Chemical name) and "Thời gian cách ly" (Withdrawal days) if the user selects the `SPRAYING` activity type.
