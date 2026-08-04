# Story 4.3: Lot Review & QR Export (Steps 5-6)

Status: ready-for-dev

## Story

As a Technical Officer,
I want to review a DRAFT lot, formally publish it to the blockchain (or immutable DB state), and generate a QR code,
so that the lot is ready for sale and verifiable by buyers.

## Dependencies
- **Depends on:** 4.2 (Draft Lot).

## Acceptance Criteria

1. **Given** a `DRAFT` lot **When** I view its detail page **Then** I see all aggregated data.
2. **Given** the review page **When** I click "Xuất bản" (Publish) **Then** the lot status changes to `PUBLISHED`.
3. **Given** a `PUBLISHED` lot **When** I view it **Then** the UI renders a QR code pointing to `https://[domain]/qr/[lot_id]`.

## Hexagonal Architecture Design & Tasks

### 1. Application Layer (`src/application/`)
- [ ] **T1.1: Create Use Case**
  - File: `src/application/useCases/lot/PublishLotUseCase.ts`
  - Logic: Fetch Lot. Ensure `status === 'DRAFT'`. Update status to `PUBLISHED`.

### 2. Presentation / API Layer (`src/app/api/`)
- [ ] **T2.1: API Route**
  - File: `src/app/api/lots/[id]/publish/route.ts` (PUT)

### 3. Frontend UI Layer (`src/app/(officer)/`)
- [ ] **T3.1: Review Page & QR Component**
  - File: `src/app/(officer)/lots/[id]/page.tsx`
  - File: `src/components/features/qr/QRGenerator.tsx`
  - Logic: Use `qrcode.react` to generate the code client-side based on the window location + `/qr/[id]`.
