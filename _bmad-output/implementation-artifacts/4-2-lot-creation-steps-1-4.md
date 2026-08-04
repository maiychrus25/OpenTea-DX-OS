# Story 4.2: Lot Creation Wizard (Steps 1-4)

Status: ready-for-dev

## Story

As a Technical Officer,
I want to use a step-by-step wizard to create a new production Lot (Lô hàng),
so that I can compile parcel data, journals, and basic info safely without making mistakes.

## Dependencies
- **Depends on:** 3.2 (Parcels exist), 4.1 (Safety Inspection API).
- **Blocks:** 4.3 (Lot Review).

## Acceptance Criteria

1. **Given** I am an Officer **When** I go to `/officer/lots/new` **Then** I see a multi-step form (Wizard).
2. **Given** Step 1 **When** I fill it **Then** I input basic info (Lot Code, Product Name, Harvest Date).
3. **Given** Step 2 **When** it loads **Then** I select one or more `Parcels` to include in this Lot. The UI must call the Safety API (Story 4.1) and disable selection for any parcel that is `IS_QUARANTINED`.
4. **Given** Step 3 **When** it loads **Then** it fetches and displays all `APPROVED` journals linked to the selected parcels so I can verify the history.
5. **Given** Step 4 **When** I click Next **Then** I can add a packaging description.
6. **Given** I finish Step 4 **When** I save **Then** the Lot is created in the DB with `status = 'DRAFT'`.

## Hexagonal Architecture Design & Tasks

### 1. Domain Layer (`src/domain/`)
- [ ] **T1.1: Define Schema**
  - File: `src/domain/schemas/lotSchema.ts`
  - `lot_code`: string (unique).
  - `product_name`: string.
  - `parcel_ids`: string[].
  - `status`: enum `['DRAFT', 'PUBLISHED']`.

### 2. Infrastructure Layer (`src/infrastructure/`)
- [ ] **T2.1: Prisma Repository**
  - File: `src/infrastructure/db/repositories/PrismaLotRepository.ts`
  - `create` must handle linking many-to-many or one-to-many relationships (Lot <-> Parcels).

### 3. Application Layer (`src/application/`)
- [ ] **T3.1: Create Use Case**
  - File: `src/application/useCases/lot/CreateDraftLotUseCase.ts`
  - Logic: Validate input, verify all `parcel_ids` are safe (re-run `WithdrawalInspectionService` server-side to prevent bypass), then save as `DRAFT`.

### 4. Presentation / API Layer (`src/app/api/`)
- [ ] **T4.1: API Route**
  - File: `src/app/api/lots/route.ts` (POST)
  - Execute Use Case, return `201 Created` with the new Lot ID.

### 5. Frontend UI Layer (`src/app/(officer)/`)
- [ ] **T5.1: Wizard Component**
  - File: `src/app/(officer)/lots/new/_components/LotWizard.tsx`
  - Use a state machine or simple `step` integer state to manage UI progression.
  - Use React Query / SWR to fetch safety status in Step 2.
