# Story 3.6: Batch Journal Approval (Officer)

Status: ready-for-dev

## Story

As a Technical Officer,
I want to view a list of all pending journal entries submitted by farmers and approve or reject them in batch,
so that I can quickly verify the farming activities and update the official HTX records without clicking into every single one.

## Dependencies
- **Depends on:** 3.3, 3.4
- **Blocks:** None

## Acceptance Criteria

1. **Given** I am logged in as an Officer **When** I navigate to `/officer/approvals` **Then** I see a data table listing all `PENDING` journal entries.
2. **Given** the table **When** I check the boxes next to multiple rows and click "Duyệt đã chọn" (Approve Selected) **Then** the system updates their statuses to `APPROVED`.
3. **Given** the Parcel Status rules (Story 3.4) **When** the batch approval succeeds **Then** the system MUST trigger the `ParcelStatusService` to evaluate and update the statuses of the associated parcels (e.g., if a SOWING journal was approved, the parcel becomes ACTIVE).
4. **Given** the table **When** I select rows and click "Từ chối" (Reject) **Then** their statuses become `REJECTED`, and the parcel statuses are NOT updated.

## Hexagonal Architecture Design & Tasks

### 1. Domain Layer (`src/domain/`)
- [ ] **T1.1: Schema Update**
  - File: `src/domain/schemas/journalSchema.ts`
  - Add `batchApprovalSchema`: `z.object({ ids: z.array(z.string().uuid()), action: z.enum(['APPROVE', 'REJECT']) })`.

### 2. Infrastructure Layer (`src/infrastructure/`)
- [ ] **T2.1: Implement Batch Operations**
  - File: `src/infrastructure/db/repositories/PrismaJournalRepository.ts`
  - Ensure methods like `updateMany(ids, data)` exist. However, because we need to trigger Parcel updates individually based on activity type, it might be safer to iterate or use a Prisma `$transaction` array.

### 3. Application Layer (`src/application/`)
- [ ] **T3.1: Create Use Case**
  - File: `src/application/useCases/journal/BatchReviewJournalsUseCase.ts`
  - Logic:
    1. Parse input `ids` and `action`.
    2. Fetch all `JournalEntry` records for those `ids`.
    3. Start a Prisma `$transaction` (via a repository wrapper if following strict Hexagonal, or pass the transaction client).
    4. For each journal:
       - Update `status` to `action`.
       - IF `action === 'APPROVE'`, invoke `ParcelStatusService.determineNextStatus(parcel.status, journal.activity_type)`.
       - Update `Parcel` if status changed.
    5. Return success count.

### 4. Presentation / API Layer (`src/app/api/`)
- [ ] **T4.1: API Route**
  - File: `src/app/api/journals/batch/route.ts` (PUT or POST)
  - Must check `session.user.role === 'OFFICER'`.
  - Execute `BatchReviewJournalsUseCase`.

### 5. Frontend UI Layer (`src/app/(officer)/`)
- [ ] **T5.1: Approval Dashboard**
  - File: `src/app/(officer)/approvals/page.tsx`
  - File: `src/app/(officer)/approvals/_components/ApprovalTable.tsx`
  - Implementation:
    - Use React state to track selected rows (`selectedIds: string[]`).
    - Render checkboxes in the table.
    - Two main buttons: Approve (Green), Reject (Red).
    - Upon click, `fetch('/api/journals/batch', { method: 'POST', body: { ids, action } })`.
    - Handle SWR mutation to refresh the table.

## Dev Notes
- **Transaction Safety:** Since approving 10 journals might update 10 different parcels, if journal #5 fails, the whole batch should roll back. Use Prisma's Interactive Transactions `prisma.$transaction(async (tx) => { ... })` and pass `tx` down to the repository methods if possible.
