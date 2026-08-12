# Story 2.0a: Nominatim Geocode Proxy Endpoint

Status: ready-for-dev

## Story

As a developer (enabling Partner Map and Farm Zone address search),
I want a `/api/geocode` proxy endpoint that routes Nominatim address search through the server,
so that client components never call external APIs directly and Nominatim ToS (1 req/s) is enforced server-side (AD-10).

## Acceptance Criteria

1. **Given** authenticated user calls `GET /api/geocode?q=<search_term>` → returns `{ results: [{ display_name, lat, lon }] }`
2. Unauthenticated request returns HTTP 401
3. Rate limiting: max 1 request per second per IP (Nominatim ToS compliance)
4. Empty or missing `q` param → HTTP 400 `{ error: { code: 'VALIDATION_ERROR', message: '...' } }`
5. Hexagonal pattern: Zod validate → `NominatimGeocodingAdapter` (infrastructure) → response
6. `User-Agent` header sent to Nominatim: `DX-AgriMarket/1.0 (contact@htx-md2.vn)` (Nominatim ToS requirement)

## Tasks / Subtasks

- [ ] Create `apps/web/src/app/api/geocode/route.ts` (AC: 1, 2, 3, 4, 5)
  - [ ] Import and call `auth()` for session check
  - [ ] Zod validate query param `q` (string, min 2, max 200 chars)
  - [ ] Rate limit: use simple in-memory Map or `next/headers` IP-based throttle
  - [ ] Instantiate `NominatimGeocodingAdapter` and call `search(q)`
  - [ ] Return formatted results
- [ ] Create `apps/web/src/domain/shared/ports/GeocodingPort.ts` (AC: 5)
  - [ ] `interface GeocodingPort { search(query: string): Promise<GeocodingResult[]> }`
  - [ ] `type GeocodingResult = { display_name: string; lat: string; lon: string }`
- [ ] Create `apps/web/src/infrastructure/geocoding/NominatimAdapter.ts` (AC: 5, 6)
  - [ ] `fetch('https://nominatim.openstreetmap.org/search?q=...')` with User-Agent header
  - [ ] Implements `GeocodingPort`
  - [ ] Parse Nominatim JSON response → `GeocodingResult[]`
- [ ] Create `apps/web/src/lib/validations/geocode.schema.ts` (AC: 4)
  - [ ] Zod schema for query params

## Dev Notes

### Hexagonal Pattern (Follow Story 1.4 Pattern)
```typescript
// route.ts pattern:
export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const parseResult = geocodeQuerySchema.safeParse({ q: searchParams.get('q') })
  if (!parseResult.success) return NextResponse.json({ error: ... }, { status: 400 })

  const adapter = new NominatimGeocodingAdapter()
  const results = await adapter.search(parseResult.data.q)
  return NextResponse.json({ results })
}
```

### Nominatim ToS Requirements
1. **User-Agent**: Required — include app name and contact
2. **Rate limit**: 1 request per second maximum
3. **Caching**: Nominatim encourages caching results — consider adding simple in-memory cache (TTL: 10 min) for same queries

### Domain Directory Structure
- `domain/shared/` already exists (for value objects shared across domains)
- `GeocodingPort.ts` goes in `domain/shared/ports/` (create dir if needed)
- `NominatimAdapter.ts` goes in `infrastructure/geocoding/` (create dir)

### Error Response Format (from withErrorHandler pattern)
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

### References
- [Source: apps/web/src/domain/profile/ports/HtxProfileRepository.ts — port interface pattern]
- [Source: apps/web/src/infrastructure/db/repositories/PrismaHtxProfileRepository.ts — adapter pattern]
- [Source: apps/web/src/presentation/api/withErrorHandler.ts — error response format]
- [Source: apps/web/src/auth.ts — auth() function]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

### File List
- `apps/web/src/app/api/geocode/route.ts` (NEW)
- `apps/web/src/domain/shared/ports/GeocodingPort.ts` (NEW)
- `apps/web/src/infrastructure/geocoding/NominatimAdapter.ts` (NEW)
- `apps/web/src/lib/validations/geocode.schema.ts` (NEW)
