# Story 4.4: Public QR Scan Page

Status: ready-for-dev

## Story

As a Consumer,
I want to scan the QR code and view the full history of the product (origin, journals, weather, safety status),
so that I can trust the quality of the agricultural product.

## Dependencies
- **Depends on:** 4.3.

## Acceptance Criteria

1. **Given** a URL `/qr/[id]` **When** I visit it **Then** I see a mobile-first UI with the Lot's data.
2. **Given** a `DRAFT` lot **When** I try to view its QR page **Then** I am denied access (404).

## Hexagonal Architecture Design & Tasks

### 1. Application Layer (`src/application/`)
- [ ] **T1.1: Create Use Case**
  - File: `src/application/useCases/lot/GetPublicLotDetailsUseCase.ts`
  - Logic: Fetch Lot. If `status !== 'PUBLISHED'`, throw NotFoundError. Include populated `Parcels` and `JournalEntries`.

### 2. Frontend UI Layer (`src/app/qr/`)
- [ ] **T2.1: Public Page**
  - File: `src/app/qr/[id]/page.tsx` (Server Component). No auth required.
