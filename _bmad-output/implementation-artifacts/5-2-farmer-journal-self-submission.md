# Story 5.2: Farmer Journal Self-Submission

Status: ready-for-dev

> [!WARNING]
> **DESIGN SYNC - 2026-08-14 (Epic 7):** Use direct routes (officer/..., farmer/...) NOT route groups. CSS tokens: var(--primary), var(--foreground), var(--card), var(--border). Shared components: Pill, Button, MetricCard from @/components/ui (available after story 7-4/7-5). No inline styles.


## Story

As a Farmer,
I want to log my own farming activities using a simple mobile-friendly form,
so that I can keep my records up-to-date without waiting for an Officer.

## Dependencies
- **Depends on:** 3.3 (Journal Form UI), 3.5 (Weather Background Sync).
- **Blocks:** None.

## Acceptance Criteria

1. **Given** I am logged in as a Farmer **When** I navigate to `/farmer/journal/new` **Then** I see the same `JournalForm` used by Officers.
2. **Given** the form **When** the backend receives my submission **Then** it automatically links the entry to my `Household` and sets the status to `PENDING`.
3. **Given** the backend **When** saving the entry **Then** it executes the Weather Auto-attach logic (Story 3.5) in the background.
4. **Given** the form UI **When** viewed on a phone **Then** the inputs (especially Date and Select) are large enough to tap easily (Touch targets >= 44px).

## Hexagonal Architecture Design & Tasks

### 1. Application Layer (`src/application/`)
- [ ] **T1.1: Use Case Re-use & Security Check**
  - File: `src/application/useCases/journal/CreateJournalEntryUseCase.ts` (From Story 3.3).
  - Add explicit security logic: If `role === 'FARMER'`, fetch the `Parcel` by ID, then verify `parcel.household_id === session.user.household_id`. Throw `403 Forbidden` if they try to log activity for another farmer's land.

### 2. Frontend UI Layer (`src/app/(farmer)/`)
- [ ] **T2.1: Page Implementation**
  - File: `src/app/(farmer)/journal/new/page.tsx`
  - Render the `<JournalForm role="FARMER" />`.
  - The Form component must conditionally hide the "Status" override field if the user is a Farmer.

- [ ] **T2.2: Mobile Polish (CSS Modules)**
  - File: `src/components/features/journal/JournalForm.module.css`
  - Add `@media (max-width: 768px)` queries to ensure `input` and `select` have `min-height: 44px` and full width.

## Dev Notes
- **RBAC Priority:** The critical part of this story is ensuring the API Route (`/api/journals`) correctly identifies the session role as `FARMER` and passes it to the UseCase, enforcing ownership rules.
