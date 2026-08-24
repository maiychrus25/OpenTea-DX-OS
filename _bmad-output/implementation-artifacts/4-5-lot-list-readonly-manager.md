# Story 4.5: Lot List Readonly Manager

Status: review

> [!WARNING]
> **DESIGN SYNC - 2026-08-14 (Epic 7):** Use direct routes (officer/..., farmer/...) NOT route groups. CSS tokens: var(--primary), var(--foreground), var(--card), var(--border). Shared components: Pill, Button, MetricCard from @/components/ui (available after story 7-4/7-5). No inline styles.


## Story

As a Manager,
I want to view the list of all published lots in the system,
so that I can oversee production output without accidentally altering the data.

## Dependencies
- **Depends on:** 4.3 (Lots must exist).

## Acceptance Criteria

1. **Given** I am logged in as a Manager **When** I navigate to `/manager/lots` **Then** I see a list of `PUBLISHED` lots.
2. **Given** the list **When** I view it **Then** I see NO buttons to Edit, Create, or Delete lots.

## Hexagonal Architecture Design & Tasks

### 1. Application Layer (`src/application/`)
- [x] **T1.1: Use Case**
  - File: `src/application/useCases/lot/GetAllLotsUseCase.ts`

### 2. Frontend UI Layer (`src/app/(manager)/`)
- [x] **T2.1: Readonly Table**
  - File: `src/app/(manager)/lots/page.tsx`
  - Re-use the table component from Officer, but omit action columns.

## Implementation Notes

- Manager lot list now requests `/api/lots?visibility=published`, which maps to `READY` and `QR_EXPORTED` lots in the current Prisma enum.
- Manager detail deep-link loads lot data through `GetLotUseCase` and returns 404 for draft/unpublished lots.
- Manager detail is read-only: no create, edit, save draft, delete, or export QR controls are rendered.
- Epic 8-3 remains FE reconstruction only; this story owns production route/data/filter/deep-link behavior.

## Verification

- `TMPDIR=/tmp npm run test -- --runInBand src/__tests__/application/useCases/list-lots-usecase.test.ts` — passed.
- `npx tsc --noEmit` — passed.
- `npm run lint` — passed with existing out-of-scope `<img>` warnings.
- `DATABASE_URL=postgresql://user:pass@localhost:5432/agrimarket npm run validate:schema` — passed.
- `TMPDIR=/tmp npm run test:contract -- --runInBand` — passed.
- `npm run build` — passed with network enabled for `next/font`; build logs existing dynamic-server/DATABASE_URL warnings but exited 0.
- `TMPDIR=/tmp npx playwright test tests/e2e/manager-workflows.spec.ts --project=chromium` — blocked by missing system library `libnspr4.so`; `npx playwright install-deps chromium` requires sudo password in this environment.
