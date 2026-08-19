# Story 9.1: FE–BE Integration — Farm Zone to Public QR

Status: ready-for-dev
Epic: 9 — FE–BE Integration and E2E Completion
Phase: integration

## Story

As a Technical Officer and buyer, I want the prototype farm, journal, harvest, lot and QR screens to use the production contracts, so that one verified workflow works end to end instead of stopping at mock state.

## Acceptance Criteria

1. Officer can create/select a household, draw or edit a parcel, assign crop/cycle data, and persist the result through canonical farm APIs.
2. Officer and Farmer journal forms submit through the shared journal contract; farmer entries are pending/withdrawable, officer entries follow the agreed approval rule, and weather is attached by the server-side weather contract.
3. Parcel status derives from journal/harvest events; withdrawal status is calculated server-side; harvest approval records actor/time and notifies Manager.
4. Officer can create/resume a draft lot from eligible parcels, edit only permitted draft fields, attach certificate references, save draft, and export QR only after required review inputs pass validation.
5. QR export writes an immutable public snapshot and locked status in a transaction; subsequent edits cannot mutate public data; public `/lot/[lot_code]` renders the snapshot without authentication.
6. Manager views read-only farm/lots detail and receives a deep-link notification; Officer retains mutation rights; Farmer cannot access another household's data.
7. Every route uses the structured response/error contract and server-side authorization; no browser call bypasses Next.js to database, n8n, MinIO, FastAPI, or external APIs.
8. The mock fixtures from Epic 8 are replaced only at the agreed seam; existing prototype visual states remain available for loading, empty, error, retry and locked states.

## Dependencies

- Depends on: 0.1, 0.2, Epic 3 farm/journal/weather stories, 4.1–4.3, 6.2, 7.9a.
- Blocks: critical-path E2E sign-off.

## Test Plan

- API contract and authorization tests for all farm/journal/lot routes.
- Integration tests with real Prisma transaction and immutable snapshot assertions.
- Playwright flow: setup → journal → withdrawal → harvest approval → lot draft → export QR → public scan.
- Negative tests for unauthorized roles, non-eligible parcels, locked lots, duplicate export and cross-household access.
