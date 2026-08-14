# Story 2.6: Agricultural Partner Map (CRUD & Display)

Status: ready-for-dev

> [!WARNING]
> **DESIGN SYNC - 2026-08-14 (Epic 7):** Use direct routes (officer/..., farmer/...) NOT route groups. CSS tokens: var(--primary), var(--foreground), var(--card), var(--border). Shared components: Pill, Button, MetricCard from @/components/ui (available after story 7-4/7-5). No inline styles.


## Story

As a Manager,
I want to manage (CRUD) and view a map of agricultural partners (buyers, suppliers),
so that the HTX has a centralized directory of contacts and their geographic locations for logistics and sales planning.

## Dependencies
- **Depends on:** 2.5
- **Blocks:** 2.7

## Acceptance Criteria

1. **Given** I am logged in as a Manager **When** I navigate to `/manager/partners` **Then** I see a Leaflet map with markers for all existing `Partner` records, and a list/table view next to or below it.
2. **Given** the Partner page **When** I click "Thêm Đối Tác" (Add Partner) **Then** a modal or form opens to input partner details (Name, Type, Contact, Lat, Lng).
3. **Given** the Add/Edit form **When** I submit valid data (validated via Zod) **Then** it sends a `POST` or `PUT` request to `/api/partners`, updates the database, and refreshes the map/list without a full page reload.
4. **Given** the map view **When** I click on a partner's marker **Then** a popup displays their name, type (BUYER/SUPPLIER/LOGISTICS), and contact info.
5. **Given** I am an Officer or Farmer **When** I try to access `/manager/partners` or the write APIs **Then** I am blocked (403 Forbidden).

## Tasks / Subtasks

- [ ] **T1: Define Domain & Repositories** (AC: 3, 5)
  - [ ] Create `src/domain/schemas/partnerSchema.ts` (Zod schema).
  - [ ] Add `IPartnerRepository` with `getAll`, `create`, `update`, `delete`.
  - [ ] Implement `PrismaPartnerRepository`.

- [ ] **T2: Backend API Routes & Use Cases** (AC: 3, 5)
  - [ ] Create `src/application/useCases/ManagePartnersUseCase.ts` (or split into Create/Update/Delete).
  - [ ] Create `src/app/api/partners/route.ts` (GET, POST).
  - [ ] Create `src/app/api/partners/[id]/route.ts` (PUT, DELETE).
  - [ ] Secure routes: Require MANAGER role. Use `withErrorHandler`.

- [ ] **T3: Map Component (Leaflet)** (AC: 1, 4)
  - [ ] Install `leaflet` and `react-leaflet`. Install types `@types/leaflet`.
  - [ ] Create `src/components/features/map/PartnerMap.tsx` (Client Component).
  - [ ] **CRITICAL:** Leaflet relies on the `window` object. You MUST dynamically import this component with `ssr: false` in Next.js to prevent hydration mismatch errors.
  - [ ] Render `<MapContainer>`, `<TileLayer>`, and `<Marker>` for each partner.

- [ ] **T4: Frontend CRUD Page** (AC: 1, 2, 3)
  - [ ] Create `src/app/(manager)/partners/page.tsx` (Server Component).
  - [ ] Create `src/app/(manager)/partners/_components/PartnerManager.tsx` (Client Component) to hold the list, map, and modal state.
  - [ ] Use `react-hook-form` + Zod for the modal.
  - [ ] Use `mutate` from SWR or React Query (if configured) or standard React state to optimistically update the UI after a successful API call.

- [ ] **T5: Validate & Commit**
  - [ ] Ensure `npx tsc --noEmit` passes.
  - [ ] Verify map loads without SSR errors.
  - [ ] Commit: `feat(map): implement partner map and crud management`

## Dev Notes

### Architecture Constraints

- **Leaflet SSR Gotcha:** (Documented in AD-18/Rules)
  ```typescript
  import dynamic from 'next/dynamic'
  const PartnerMap = dynamic(() => import('@/components/features/map/PartnerMap'), { ssr: false })
  ```
- **Form Validation:** Share the `partnerSchema.ts` between the client form and the API route.

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_None yet_

### Completion Notes List

_To be filled after implementation_

### File List

**Files to CREATE:**
- `apps/web/src/domain/schemas/partnerSchema.ts`
- `apps/web/src/domain/repositories/IPartnerRepository.ts`
- `apps/web/src/infrastructure/db/repositories/PrismaPartnerRepository.ts`
- `apps/web/src/application/useCases/ManagePartnersUseCase.ts`
- `apps/web/src/app/api/partners/route.ts`
- `apps/web/src/app/api/partners/[id]/route.ts`
- `apps/web/src/components/features/map/PartnerMap.tsx`
- `apps/web/src/app/(manager)/partners/page.tsx`
- `apps/web/src/app/(manager)/partners/_components/PartnerManager.tsx`

**Files to UPDATE:**
- `apps/web/package.json` (Add `leaflet`, `react-leaflet`, `@types/leaflet`)
