# Story 5.2: Farmer Journal Self-Submission

Status: review

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
- [x] **T1.1: Use Case Re-use & Security Check**
  - File: `src/application/useCases/journal/CreateJournalEntryUseCase.ts` (From Story 3.3).
  - Add explicit security logic: If `role === 'FARMER'`, fetch the `Parcel` by ID, then verify `parcel.household_id === session.user.household_id`. Throw `403 Forbidden` if they try to log activity for another farmer's land.

### 2. Frontend UI Layer (`src/app/(farmer)/`)
- [x] **T2.1: Page Implementation**
  - File: `src/app/(farmer)/journal/new/page.tsx`
  - Render the `<JournalForm role="FARMER" />`.
  - The Form component must conditionally hide the "Status" override field if the user is a Farmer.

- [x] **T2.2: Mobile Polish (CSS Modules)**
  - File: `src/components/features/journal/JournalForm.module.css`
  - Add `@media (max-width: 768px)` queries to ensure `input` and `select` have `min-height: 44px` and full width.

## Dev Notes
- **RBAC Priority:** The critical part of this story is ensuring the API Route (`/api/journals`) correctly identifies the session role as `FARMER` and passes it to the UseCase, enforcing ownership rules.

## Implementation Notes

- Farmer household scope is resolved from `households.keycloak_user_id = session.user.id`; the flow no longer depends on a non-existent `session.user.household_id` claim.
- `/api/farm/parcels` and `/api/journal` force Farmer reads to the resolved household; unlinked Farmer accounts receive a 403 through the application use case.
- Farmer journal creation keeps existing weather-cache auto-attach behavior and stores Farmer submissions as `PENDING_APPROVAL`.
- `/farmer/journal/new` is a real guarded route for mobile submission. The Farmer list links to it and uses API delete as withdraw for pending entries.
- Journal submit/withdraw notifications are persisted for Officer review, and approval notifications are sent to the linked Farmer recipient when available.
- Epic 8-7 and 8-12 remain Officer/UI mock surfaces and do not close Farmer production flow behavior.

## Verification

- `TMPDIR=/tmp npm run test -- --runInBand src/__tests__/application/useCases/farmer-journal-flow.test.ts` — passed, 4 tests.
- `npx tsc --noEmit` — passed.
- `npm run lint` — passed with existing out-of-scope `<img>` warnings.
- `DATABASE_URL=postgresql://user:pass@localhost:5432/agrimarket npm run validate:schema` — passed.
- `npm run build` — passed with network enabled for `next/font`; build logs existing dynamic-server/DATABASE_URL prerender warnings but exits 0.
