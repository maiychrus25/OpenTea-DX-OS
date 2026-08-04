# Story 6.2: Certificate Selection for QR Lot

Status: ready-for-dev

## Story

As a Technical Officer,
I want to be able to select documents (like VietGAP, GlobalGAP certificates) from the MinIO document store when creating a Lot,
so that consumers scanning the QR code can download and verify these certificates.

## Dependencies
- **Depends on:** 6.1, 4.2
- **Blocks:** None

## Acceptance Criteria

1. **Given** Step 4 of the Lot Creation Wizard (Story 4.2) **When** it loads **Then** instead of a blank text input, I see a list of documents available in the HTX Document Store (from Story 6.1).
2. **Given** the document list **When** I check the boxes next to the relevant certificates **Then** their MinIO object keys are attached to the Lot Draft.
3. **Given** the Public QR Scan Page (Story 4.4) **When** the consumer views the lot **Then** the page fetches pre-signed GET URLs for those certificates so the consumer can download them.

## Tasks / Subtasks

- [ ] **T1: API Endpoint for Selection**
  - [ ] Create `src/app/api/documents/route.ts` (GET) to list all available certificates from MinIO (or the `Document` DB table).

- [ ] **T2: Wizard UI Update**
  - [ ] Update `LotWizard.tsx` (Step 4). Fetch the list of documents and render them as a multi-select or checkbox list.

- [ ] **T3: Public Page Update**
  - [ ] Update `GetPublicLotDetailsUseCase` to generate pre-signed GET URLs for any attached certificates.
  - [ ] Update `src/app/qr/page.tsx` to render download links for these certificates.

## Dev Notes

- Do not expose the raw MinIO keys to the public frontend; expose only the short-lived pre-signed URLs.

## File List

**Files to CREATE:**
- `apps/web/src/app/api/documents/route.ts`

**Files to UPDATE:**
- `apps/web/src/app/(officer)/lots/new/_components/LotWizard.tsx`
- `apps/web/src/application/useCases/GetPublicLotDetailsUseCase.ts`
- `apps/web/src/app/qr/page.tsx`
