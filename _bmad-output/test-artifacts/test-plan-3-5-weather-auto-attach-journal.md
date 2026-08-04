# 🧪 Test Plan — Story 3.5: Weather Auto-Attach

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 3.5 — Weather Auto-Attach (Background)
**Date:** 2026-08-05
**Risk Level:** 🟡 MEDIUM — Asynchronous external API calls can fail silently or cause race conditions.

---

## Detailed Test Cases

### TC-3.5-01: OpenMeteo Adapter Parsing (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P1
**Target File:** `src/infrastructure/external/OpenMeteoAdapter.test.ts`

**Test Setup & Execution:**
1. Use `global.fetch = jest.fn()` to mock the Open-Meteo API response with sample JSON:
   `{"daily": {"temperature_2m_max": [35.5], "temperature_2m_min": [24.1], "precipitation_sum": [12.0]}}`.
2. Call `OpenMeteoAdapter.getHistoricalWeather(10.0, 105.0, '2023-10-10')`.
3. Assert that the adapter correctly transforms the API's array-based `daily` format into the domain object: `{ temp_max: 35.5, temp_min: 24.1, precipitation: 12.0 }`.

### TC-3.5-02: Use Case Idempotency / Deduplication (Integration)

**Type:** Integration
**Tool:** Jest
**Priority:** P0
**Target File:** `src/application/useCases/weather/SyncJournalWeatherUseCase.test.ts`

**Test Setup:**
1. Seed `WeatherCache` with a record for `parcel_id = 'p-1'` and `date = '2023-10-10'`.
2. Mock `OpenMeteoAdapter.getHistoricalWeather` with a spy.
3. Seed a new `JournalEntry` without a `weather_cache_id` on that same date for that parcel.

**Execution:**
1. Execute `SyncJournalWeatherUseCase` for the new journal.

**Expected Results:**
- The Use Case MUST NOT call the `OpenMeteoAdapter` spy.
- It MUST reuse the existing `WeatherCache` ID and update the `JournalEntry`.

### TC-3.5-03: Graceful Failure (Integration)

**Type:** Integration
**Tool:** Jest
**Priority:** P0

**Execution:**
1. Mock `OpenMeteoAdapter` to throw a network error (e.g., 500 API down).
2. Execute the Use Case.
3. Assert that the Use Case handles the error gracefully (logs it) and DOES NOT throw an unhandled promise rejection that would crash the Node process. The journal remains with `weather_cache_id = null`.

---

## Definition of Done

- [ ] `TC-3.5-01` PASS: Adapter translates external schema to domain schema.
- [ ] `TC-3.5-02` PASS: DB cache prevents redundant external API calls.
- [ ] `TC-3.5-03` PASS: Background failure is caught securely.
- [ ] Committed with: `feat(weather): implement background weather sync for journals`
