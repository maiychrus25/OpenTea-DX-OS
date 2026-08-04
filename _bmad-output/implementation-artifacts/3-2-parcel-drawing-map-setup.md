# Story 3.2: Parcel Drawing & Map Setup (Officer)

Status: ready-for-dev

## Story

As a Technical Officer,
I want to add a new land parcel (thửa đất) and draw its boundaries on a map,
so that the HTX has an accurate geographic record of the farming zones.

## Dependencies
- **Depends on:** 3.1
- **Blocks:** 3.3, 3.7

## Acceptance Criteria

1. **Given** the Officer's dashboard **When** I navigate to `/officer/zones` **Then** I see the list of parcels and a "Thêm thửa đất" button.
2. **Given** the add/edit parcel page **When** it opens **Then** it contains a form (Farmer selection, Area, Address, Default Crop Type) and an interactive Leaflet map.
3. **Given** the interactive map **When** I click to draw a polygon **Then** the polygon coordinates are captured and converted to standard GeoJSON format (`Polygon` type). The UI MUST strictly enforce that only ONE polygon is drawn per parcel.
4. **Given** the form **When** I submit **Then** it validates that a polygon has been drawn and sends a POST/PUT to `/api/parcels`.
5. **Given** the backend **When** processing the request **Then** it calculates the `centroid_lat` and `centroid_lng` mathematically based on the GeoJSON polygon, and saves the parcel to the PostgreSQL database.

## Hexagonal Architecture Design & Tasks

### 1. Domain Layer (`src/domain/`)
- [ ] **T1.1: Define Zod Schema**
  - File: `src/domain/schemas/parcelSchema.ts`
  - Implementation:
    - `household_id`: string (UUID).
    - `area_m2`: number (positive).
    - `address`: string.
    - `polygon_geojson`: JSON object (strict validation for GeoJSON structure using Zod custom refinement or standard object shape: `{ type: "Polygon", coordinates: z.array(...) }`).
- [ ] **T1.2: Define Entity**
  - File: `src/domain/entities/Parcel.ts`
  - Extend schema with `id`, `centroid_lat`, `centroid_lng`, `status`.
- [ ] **T1.3: Define Repository Port**
  - File: `src/domain/ports/IParcelRepository.ts`
  - Define `create(data: Omit<Parcel, 'id' | 'status'>)` and `update(...)`.

### 2. Infrastructure Layer (`src/infrastructure/`)
- [ ] **T2.1: Implement Repository**
  - File: `src/infrastructure/db/repositories/PrismaParcelRepository.ts`
  - Implementation: `prisma.parcel.create`. Ensure `polygon_geojson` is cast to Prisma's JSON type properly.

### 3. Application Layer (`src/application/`)
- [ ] **T3.1: Centroid Calculation Utility**
  - File: `src/application/utils/centroidCalculator.ts`
  - Implementation: Use `@turf/centroid` to guarantee accurate mathematical calculation. `export const calculateCentroid = (geoJson: GeoJSON.Polygon) => { ... }`.
- [ ] **T3.2: Create Use Case**
  - File: `src/application/useCases/parcel/ManageParcelsUseCase.ts`
  - Logic: 
    1. Parse and validate input data.
    2. Call `calculateCentroid(data.polygon_geojson)`.
    3. Construct final object.
    4. Pass to `IParcelRepository.create`.

### 4. Presentation / API Layer (`src/app/api/`)
- [ ] **T4.1: API Routes**
  - File: `src/app/api/parcels/route.ts` (POST)
  - Ensure `session.user.role === 'OFFICER'`.
  - Extract body, inject `PrismaParcelRepository` into `ManageParcelsUseCase`, execute, return `201 Created`.

### 5. Frontend UI Layer (`src/app/(officer)/`)
- [ ] **T5.1: Map Drawing Component**
  - File: `src/components/features/map/DrawMap.tsx`
  - Note: MUST be a Client Component (`'use client'`). MUST be dynamically imported with `ssr: false` in the parent page to prevent `window is not defined` hydration errors.
  - Implementation: Install `leaflet` and `leaflet-draw`. Use a `useEffect` to instantiate the map and attach `new L.Control.Draw({ draw: { polygon: true, polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false } })`.
  - Callback: Listen to `map.on(L.Draw.Event.CREATED, (e) => { ... })`. Extract `layer.toGeoJSON().geometry` and pass it to the parent form via `onPolygonDrawn(geoJson)`.
- [ ] **T5.2: Form Page**
  - File: `src/app/(officer)/zones/new/page.tsx`
  - Use `react-hook-form`. Add a hidden input or state to hold the GeoJSON. Validate before submission.

## Dev Notes
- **Leaflet Draw Wrapper:** Avoid using outdated wrappers like `react-leaflet-draw`. It is much safer and more stable to attach raw `leaflet-draw` controls to the `MapContainer` reference directly via a React `useRef` and `useEffect`.
- **Turf.js Dependency:** Install `@turf/centroid` and `@turf/helpers` for robust geographic math.
