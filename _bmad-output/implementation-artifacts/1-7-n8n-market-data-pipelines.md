# Story 1.7: n8n Market Data Pipelines (Foundation)

Status: ready-for-dev

## Story

As a developer,
I want the n8n workflows for ingesting USDA, Open-Meteo, and Frankfurter data established and inserting data into the PostgreSQL database,
so that the Next.js application has a populated, constantly updating source of market and weather data without running its own background jobs.

## Dependencies
- **Depends on:** 1.6
- **Blocks:** 2.1

## Acceptance Criteria

1. **Given** the n8n docker service **When** I log in to the n8n UI **Then** I see 3 active workflows: `USDA_Sync`, `OpenMeteo_Sync`, and `FxRate_Sync`.
2. **Given** the PostgreSQL database is accessible from the n8n container **When** `FxRate_Sync` runs daily **Then** it fetches the exchange rates from ExchangeRate-API and upserts it into the `FxRate` table as JSONB.
3. **Given** `USDA_Sync` **When** it runs **Then** it fetches global rice/mango export prices (mocked if USDA API requires complex auth for MVP) and upserts them into the `MarketData` table.
4. **Given** `OpenMeteo_Sync` **When** it runs hourly **Then** it reads the centroid coordinates of all Parcels from the database, fetches current weather for each from Open-Meteo, and inserts records into the `WeatherCache` table.
5. **Given** the workflows **When** they are finalized **Then** they are exported as JSON files and committed to the `workflows/` directory in the repository for version control.

## Tasks / Subtasks

- [ ] **T1: n8n Database Connection Setup** (AC: 1, 2)
  - [ ] Start n8n locally.
  - [ ] Add a new "PostgreSQL" credential in n8n.
  - [ ] Configure it to connect to the local Postgres container (Host: `postgres`, DB: `agrimarket`, User: `agrimarket` — mapped from `.env`).

- [ ] **T2: FxRate_Sync Workflow** (AC: 2)
  - [ ] Create workflow triggered by a daily Cron node.
  - [ ] Add HTTP Request node to call Frankfurter API: `https://api.frankfurter.app/latest?from=USD&to=VND`.
  - [ ] Add Postgres node to `INSERT` the rate into the `FxRate` table.

- [ ] **T3: USDA_Sync Workflow** (AC: 3)
  - [ ] Create workflow triggered by a weekly Cron node.
  - [ ] Add HTTP Request node to call a market data source (if USDA requires complex auth, use a mock REST endpoint or a simpler public API for the MVP POF).
  - [ ] Map the JSON response to the `MarketData` schema (`source`, `commodity`, `metric`, `value`, `unit`, `period`).
  - [ ] Add Postgres node to `INSERT ... ON CONFLICT DO UPDATE` (upsert) into `MarketData`.

- [ ] **T4: OpenMeteo_Sync Workflow** (AC: 4)
  - [ ] Create workflow triggered by an hourly Cron node.
  - [ ] Add Postgres node (Query) to `SELECT id, centroid_lat, centroid_lng FROM "Parcel" WHERE status != 'DRAFT'`.
  - [ ] Add an Item Lists / Split In Batches node to loop through parcels.
  - [ ] Add HTTP Request node calling Open-Meteo for each parcel's coordinates.
  - [ ] Map the response to the `WeatherCache` table format.
  - [ ] Add Postgres node to `INSERT` into `WeatherCache`.

- [ ] **T5: Export and Commit** (AC: 5)
  - [ ] In the n8n UI, export all 3 workflows as JSON.
  - [ ] Save them to `workflows/fxrate_sync.json`, `workflows/usda_sync.json`, and `workflows/openmeteo_sync.json`.
  - [ ] Commit these files.

## Dev Notes

### Architecture Constraints

```
AD-9: n8n handles ALL background jobs, external API polling, and AI orchestration.
AD-11: Next.js NEVER writes to MarketData, WeatherCache, or FxRate. It only reads.
```
This architectural split means n8n must write directly to the PostgreSQL database. Do not create Next.js API routes for n8n to POST to; use the n8n Postgres node.

### Local Development Gotchas

- **n8n to Postgres connection:** When running in Docker Compose, n8n refers to the database host as `postgres` (the service name), not `localhost`.
- **Open-Meteo API Limits:** Free tier allows 10,000 calls per day. With 5 parcels * 24 hours = 120 calls/day. This is well within limits, but ensure the workflow doesn't infinitely loop on error.

### Seed Data Interaction

The `OpenMeteo_Sync` workflow relies on Parcels existing in the database with valid `centroid_lat` and `centroid_lng`. Ensure Story 1.3's seed script populates these fields for testing.

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_None yet_

### Completion Notes List

_To be filled after implementation_

### File List

**Files to CREATE:**
- `workflows/fxrate_sync.json`
- `workflows/usda_sync.json`
- `workflows/openmeteo_sync.json`

**Files to UPDATE:**
- N/A (The work is done in the n8n UI, exported to the files above).
