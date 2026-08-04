# Story 3.5: Weather Auto-Attach (Background)

Status: ready-for-dev

## Story

As a System,
I want to automatically attach the historical weather data for a parcel on the exact day a journal entry was recorded,
so that the HTX has comprehensive climate context for crop growth without asking farmers to manually enter weather info.

## Dependencies
- **Depends on:** 3.3
- **Blocks:** None

## Acceptance Criteria

1. **Given** a new `JournalEntry` is created **When** it is saved to the database (regardless of `PENDING` or `APPROVED`) **Then** it publishes an event or triggers an asynchronous background job.
2. **Given** the background job **When** it runs **Then** it looks up the `centroid_lat` and `centroid_lng` of the `Parcel` associated with the journal entry.
3. **Given** the coordinates and the `recorded_date` **When** the system queries the external Open-Meteo API (Historical) **Then** it retrieves the `temp_max`, `temp_min`, `precipitation`, and `humidity`.
4. **Given** the retrieved weather data **When** it is received **Then** it is saved to the `WeatherCache` table, and the `weather_cache_id` on the `JournalEntry` is updated to link to this new record.
5. **Given** the background execution architecture (AD-7) **When** this logic is implemented **Then** it MUST NOT block the primary HTTP request of creating the journal entry.

## Hexagonal Architecture Design & Tasks

### 1. Domain Layer (`src/domain/`)
- [ ] **T1.1: Define Port for Weather API**
  - File: `src/domain/ports/IWeatherService.ts`
  - Method: `getHistoricalWeather(lat: number, lng: number, date: string): Promise<WeatherData>`

### 2. Infrastructure Layer (`src/infrastructure/`)
- [ ] **T2.1: Implement Weather Adapter**
  - File: `src/infrastructure/external/OpenMeteoAdapter.ts`
  - Implementation: Use `fetch` to call `https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lng}&start_date={date}&end_date={date}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`.
  - Handle rate limits or fetch errors gracefully (return null or throw specific domain error).

### 3. Application Layer (`src/application/`)
- [ ] **T3.1: Create Background Job / Use Case**
  - File: `src/application/useCases/weather/SyncJournalWeatherUseCase.ts`
  - Logic:
    1. Fetch `JournalEntry` by ID.
    2. Fetch `Parcel` by `journal.parcel_id`.
    3. Call `IWeatherService.getHistoricalWeather(parcel.centroid_lat, parcel.centroid_lng, journal.recorded_date)`.
    4. Save to `WeatherCache` table via `IWeatherRepository`.
    5. Update `JournalEntry` with new `weather_cache_id`.

### 4. Background Execution Orchestration
- [ ] **T4.1: Trigger Async Execution**
  - File: `src/application/useCases/journal/CreateJournalEntryUseCase.ts` (Update from Story 3.3)
  - Logic: In Next.js, use `waitUntil()` (if deployed on Vercel) or simply fire a non-awaited Promise `SyncJournalWeatherUseCase.execute(journal.id).catch(console.error)` before returning the HTTP response.
  - *Alternative for MVP (if `waitUntil` is complex):* Just use a non-awaited Promise. The system is low-traffic enough that serverless functions won't immediately die before the `fetch` completes in most cases, but `waitUntil` is safer.

## Dev Notes
- **Idempotency:** The Open-Meteo API is free but rate-limited. If a user creates 10 journals for the same parcel on the same date, the system *should* ideally check if a `WeatherCache` record already exists for that `(parcel_id, date)` before calling the external API. Implementing this check in `SyncJournalWeatherUseCase` is highly recommended.
