# Story 2.8: Farm Zone Readonly View (Manager)

Status: ready-for-dev
> [!WARNING]
> **DESIGN SYNC - 2026-08-14 (Epic 7):** Use direct routes (officer/..., farmer/...) NOT route groups. CSS tokens: var(--primary), var(--foreground), var(--card), var(--border). Shared components: Pill, Button, MetricCard from @/components/ui (available after story 7-4/7-5). No inline styles.

## Story

As a Manager,
I want a read-only list and map view of all Farm Zones (vùng trồng) in the cooperative,
so that I can oversee the total land area, what crops are currently planted, and the general status of all parcels without needing to edit them.

## Dependencies
- **Depends on:** 2.7
- **Blocks:** 3.1

## Acceptance Criteria

1. **Given** I am logged in as a Manager **When** I navigate to `/manager/zones` **Then** I see a data table listing all `Parcel` records (Mã vùng, Nông hộ, Diện tích, Cây trồng hiện tại, Trạng thái).
2. **Given** the list view **When** I click a "View Map" toggle/button **Then** the UI switches to (or displays alongside) a Leaflet map showing the `polygon_geojson` boundaries of all parcels.
3. **Given** the map view **When** I click on a parcel polygon **Then** a popup displays the parcel code, farmer name, and current crop.
4. **Given** the data **When** the page loads **Then** it aggregates the total area of all active parcels and displays it as a summary statistic at the top of the page.
5. **Given** the hexagonal architecture **When** data is fetched **Then** it uses `GetAllParcelsUseCase` which retrieves data through `IParcelRepository`.
6. **Given** the Manager role **When** they view the UI **Then** there are NO buttons to add, edit, or delete parcels (those are for the Officer).

## Tasks / Subtasks

- [ ] **T1: Define Domain & Repository** (AC: 5)
  - [ ] Create `src/domain/repositories/IParcelRepository.ts`. Add `getAllParcels(): Promise<Parcel[]>`.
  - [ ] Implement `PrismaParcelRepository`. Ensure the query `include`s the relation to `Household` (to get the farmer name) and `ParcelCropCycle` (to get the current crop, filtering by `status = 'ACTIVE'`).

- [ ] **T2: Create Use Case** (AC: 5)
  - [ ] Create `src/application/useCases/GetAllParcelsUseCase.ts`.
> **DESIGN SYNC - 2026-08-14 (Epic 7):** Use direct routes (officer/..., farmer/...) NOT route groups. CSS tokens: var(--primary), var(--foreground), var(--card), var(--border). Shared components: Pill, Button, MetricCard from @/components/ui (available after story 7-4/7-5). No inline styles.

## Story

As a Manager,
I want a read-only list and map view of all Farm Zones (vùng trồng) in the cooperative,
so that I can oversee the total land area, what crops are currently planted, and the general status of all parcels without needing to edit them.

## Dependencies
- **Depends on:** 2.7
- **Blocks:** 3.1

## Acceptance Criteria

1. **Given** I am logged in as a Manager **When** I navigate to `/manager/zones` **Then** I see a data table listing all `Parcel` records (Mã vùng, Nông hộ, Diện tích, Cây trồng hiện tại, Trạng thái).
2. **Given** the list view **When** I click a "View Map" toggle/button **Then** the UI switches to (or displays alongside) a Leaflet map showing the `polygon_geojson` boundaries of all parcels.
3. **Given** the map view **When** I click on a parcel polygon **Then** a popup displays the parcel code, farmer name, and current crop.
4. **Given** the data **When** the page loads **Then** it aggregates the total area of all active parcels and displays it as a summary statistic at the top of the page.
5. **Given** the hexagonal architecture **When** data is fetched **Then** it uses `GetAllParcelsUseCase` which retrieves data through `IParcelRepository`.
6. **Given** the Manager role **When** they view the UI **Then** there are NO buttons to add, edit, or delete parcels (those are for the Officer).

## Tasks / Subtasks

- [ ] **T1: Define Domain & Repository** (AC: 5)
  - [ ] Create `src/domain/repositories/IParcelRepository.ts`. Add `getAllParcels(): Promise<Parcel[]>`.
  - [ ] Implement `PrismaParcelRepository`. Ensure the query `include`s the relation to `Household` (to get the farmer name) and `ParcelCropCycle` (to get the current crop, filtering by `status = 'ACTIVE'`).

- [ ] **T2: Create Use Case** (AC: 5)
  - [ ] Create `src/application/useCases/GetAllParcelsUseCase.ts`.

- [ ] **T3: Map Component Update** (AC: 2, 3)
  - [ ] Create or update `src/components/features/map/ZoneMap.tsx` (Client Component, dynamic import).
  - [ ] Ensure it can render GeoJSON polygons (using `GeoJSON` component from `react-leaflet`).
  - [ ] Add `bindPopup` logic to the polygons to show the parcel details.

- [ ] **T4: Frontend Page (Manager)** (AC: 1, 4, 6)
  - [ ] Create `src/app/manager/zones/page.tsx` (Server Component).
  - [ ] Fetch data via `GetAllParcelsUseCase`.
  - [ ] Calculate `totalArea = parcels.reduce((sum, p) => sum + p.area_m2, 0)`.
  - [ ] Render a `<MetricCard>` (from Epic 7) for `totalArea`.
  - [ ] Render a DataTable (using standard HTML `<table>` or a lightweight component, styled with module CSS).
  - [ ] Include the `<ZoneMap>` component. Ensure NO edit buttons are present.

- [ ] **T5: Validate & Commit**
  - [ ] Ensure `npx tsc --noEmit` passes.
  - [ ] Commit: `feat(zone): implement readonly farm zone list and map for manager`

## Dev Notes

### Architecture Constraints

- **Data Fetching:** Since this is a Server Component, you don't need a Next.js API route (`/api/zones`) for the Manager view. Just instantiate the Use Case directly in `page.tsx` and pass the data down as props.
- **Prisma Relations:** To fulfill AC1, the Prisma query must join tables:
  ```typescript
  const parcels = await prisma.parcel.findMany({
    include: {
      household: true,
      cycles: {
        where: { status: 'ACTIVE' },
        take: 1
      }
    }
  })
  ```
- **Map SSR:** Don't forget `dynamic(() => import('...'), { ssr: false })` for the map component.

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_None yet_

### Completion Notes List

_To be filled after implementation_

### File List

**Files to CREATE:**
- `apps/web/src/domain/repositories/IParcelRepository.ts`
- `apps/web/src/infrastructure/db/repositories/PrismaParcelRepository.ts`
- `apps/web/src/application/useCases/GetAllParcelsUseCase.ts`
- `apps/web/src/components/features/map/ZoneMap.tsx`
- `apps/web/src/app/manager/zones/page.tsx`
- `apps/web/src/app/manager/zones/page.module.css`

**Files to UPDATE:**
- N/A
