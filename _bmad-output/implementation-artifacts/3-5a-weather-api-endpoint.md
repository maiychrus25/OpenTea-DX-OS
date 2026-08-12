# Story 3.5a: Weather Data API Endpoint

Status: ready-for-dev

## Story

As a developer (enabling weather auto-attach in Stories 3.3 and 3.5),
I want a `GET /api/weather` endpoint that returns cached weather data for a given date and parcel,
so that journal entry forms can auto-fill weather fields on date-blur with data from the weather_cache table.

## Acceptance Criteria

1. **Given** `GET /api/weather?date=YYYY-MM-DD&parcelId=<uuid>` → returns `{ data: { condition, temperature_c, precipitation_mm, humidity_pct } }` from `weather_cache`
2. Cache miss (date not in weather_cache for parcel coordinates) → falls back to Open-Meteo Historical API, stores in `weather_cache`, returns data
3. Response time < 2 seconds (cache hit < 100ms; fallback < 2s)
4. Invalid date format → HTTP 400 validation error
5. Unauthenticated request → HTTP 401
6. Invalid/non-existent `parcelId` → HTTP 404
7. Hexagonal: Zod validate → `GetWeatherUseCase` → `PrismaWeatherCacheRepository` (cache lookup) + `OpenMeteoAdapter` (fallback)

## Tasks / Subtasks

- [ ] Create `apps/web/src/app/api/weather/route.ts` (AC: 1, 2, 4, 5, 7)
  - [ ] Auth check → Zod validate `{ date, parcelId }` → use case → return response
- [ ] Create `apps/web/src/lib/validations/weather.schema.ts` (AC: 4)
  - [ ] `{ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), parcelId: z.string().uuid() }`
- [ ] Create `apps/web/src/domain/farm/ports/WeatherCachePort.ts` (AC: 7)
  - [ ] `interface WeatherCachePort { findNearest(parcelId, date): Promise<WeatherData | null>; save(data): Promise<void> }`
- [ ] Create `apps/web/src/domain/shared/ports/WeatherFetchPort.ts` (AC: 7)
  - [ ] `interface WeatherFetchPort { fetchHistorical(lat, lon, date): Promise<WeatherData> }`
- [ ] Create `apps/web/src/application/farm/GetWeatherUseCase.ts` (AC: 1, 2, 7)
  - [ ] Constructor injection: `WeatherCachePort`, `WeatherFetchPort`, `HouseholdRepository` (for parcel coords)
  - [ ] Logic: find parcel centroid → check cache → if miss: fetch Open-Meteo → save → return
- [ ] Create `apps/web/src/infrastructure/db/farm/PrismaWeatherCacheRepository.ts` (AC: 1, 2)
  - [ ] Query `weather_cache` table; find nearest record by date for parcel coordinates
- [ ] Create `apps/web/src/infrastructure/weather/OpenMeteoAdapter.ts` (AC: 2, 3)
  - [ ] Call `https://archive-api.open-meteo.com/v1/archive?...`
  - [ ] Map response to `WeatherData` domain type

## Dev Notes

### Open-Meteo Historical API
```
GET https://archive-api.open-meteo.com/v1/archive
  ?latitude={lat}&longitude={lon}
  &start_date={date}&end_date={date}
  &hourly=temperature_2m,precipitation,relative_humidity_2m,weathercode
  &timezone=Asia/Ho_Chi_Minh
```
No API key required. Returns JSON with hourly arrays — pick noon (index 12) for daily summary.

### weather_cache Table Schema (from schema.prisma)
```prisma
model WeatherCache {
  id              String   @id
  parcel_id       String
  recorded_at     DateTime
  condition       String
  temperature_c   Float
  precipitation_mm Float
  humidity_pct    Float
}
```

### WeatherData Domain Type
```typescript
type WeatherData = {
  condition: string    // e.g. "Nắng", "Mây", "Mưa"
  temperature_c: number
  precipitation_mm: number
  humidity_pct: number
}
```

### Directory Structure
- `domain/farm/` — new domain for farm/weather (create if not exists)
- `application/farm/` — use case directory (create if not exists)
- `infrastructure/db/farm/` — Prisma repositories for farm domain
- `infrastructure/weather/` — Open-Meteo adapter

### References
- [Source: apps/web/prisma/schema.prisma — WeatherCache model definition]
- [Source: apps/web/src/application/useCases/ — existing UseCase pattern]
- [Source: apps/web/src/infrastructure/db/repositories/PrismaHtxProfileRepository.ts — Prisma adapter pattern]
- [Source: https://open-meteo.com/en/docs/historical-weather-api — Open-Meteo docs]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

### File List
- `apps/web/src/app/api/weather/route.ts` (NEW)
- `apps/web/src/lib/validations/weather.schema.ts` (NEW)
- `apps/web/src/domain/farm/ports/WeatherCachePort.ts` (NEW)
- `apps/web/src/domain/shared/ports/WeatherFetchPort.ts` (NEW)
- `apps/web/src/application/farm/GetWeatherUseCase.ts` (NEW)
- `apps/web/src/infrastructure/db/farm/PrismaWeatherCacheRepository.ts` (NEW)
- `apps/web/src/infrastructure/weather/OpenMeteoAdapter.ts` (NEW)
