# 🧪 Test Plan — Story 3.2: Parcel Drawing & Map Setup

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 3.2 — Parcel Drawing & Map Setup (Officer)
**Date:** 2026-08-05
**Risk Level:** 🔴 HIGH — Geographic data integrity is paramount. SSR rendering failures with Leaflet are very common.

---

## Testing Strategy & Setup

- **Tools:** Jest, Playwright.
- **Dependencies:** `@turf/centroid` logic must be verified independently of the React components.

---

## Detailed Test Cases

### TC-3.2-01: Centroid Mathematical Accuracy (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P0
**Target File:** `src/application/utils/centroidCalculator.test.ts`

**Test Setup & Execution:**
1. Create a mock GeoJSON Polygon representing a perfect square from `[0,0]` to `[10,10]`.
2. Call `calculateCentroid(geoJson)`.
3. Assert that the returned `lat` is exactly `5` and `lng` is exactly `5`.
4. Create a mock GeoJSON Polygon with a complex asymmetric shape. Verify it does not throw errors and returns reasonable bounds.

### TC-3.2-02: Form Validation requires Polygon (Integration)

**Type:** Integration
**Tool:** Jest
**Priority:** P1
**Target File:** `src/app/api/parcels/route.test.ts`

**Execution:**
1. Mock `getServerSession` as `OFFICER`.
2. Send a POST request to `/api/parcels` with a payload containing `household_id`, `area_m2`, `address`, but omit `polygon_geojson` (or pass `null`).
3. Send another request with a malformed `polygon_geojson` (e.g., `type: "Point"` instead of `"Polygon"`).

**Expected Results:**
- Both requests must be rejected by the Zod schema validation in the Use Case.
- API returns `400 Bad Request` with Zod error details.

### TC-3.2-03: Leaflet SSR Hydration & Render (E2E)

**Type:** E2E
**Tool:** Playwright
**Priority:** P0
**Target File:** `tests/e2e/parcel/draw-map.spec.ts`

**Test Setup:**
Ensure Playwright captures all browser console logs via `page.on('pageerror', ...)`.

**Execution:**
1. Login as `OFFICER`.
2. Navigate to `/officer/zones/new`.
3. Assert that the `.leaflet-container` div is visible on the screen.
4. Assert that the `leaflet-draw` toolbar (the polygon icon) is visible on the left side of the map.
5. Review the captured browser console logs.

**Expected Results:**
- Map and draw tools render successfully.
- NO console errors containing `window is not defined` or `Hydration failed`.

---

## Definition of Done

- [ ] `TC-3.2-01` PASS: Centroid utility is mathematically verified.
- [ ] `TC-3.2-02` PASS: Zod schema strictly requires valid Polygon geometry.
- [ ] `TC-3.2-03` PASS: Map component loads without SSR errors.
- [ ] Committed with: `feat(zone): implement parcel drawing and centroid calculation`
