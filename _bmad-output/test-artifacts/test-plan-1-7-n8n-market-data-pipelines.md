# 🧪 Test Plan — Story 1.7: n8n Market Data Pipelines

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 1.7 — n8n Market Data Pipelines (Foundation)
**Date:** 2026-08-05
**Risk Level:** 🟡 MEDIUM — External API dependencies are inherently flaky. n8n must handle errors gracefully without crashing the container or spamming logs.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| External API downtime (e.g., Frankfurter) | HIGH | LOW | n8n "Continue On Fail" + retry logic |
| Postgres connection fails | LOW | HIGH | Docker Compose `depends_on: postgres` |
| Duplicate data inserts | MEDIUM | HIGH | `ON CONFLICT DO UPDATE` (upsert) in SQL |
| Missing Parcel coordinates break OpenMeteo | MEDIUM | MEDIUM | Filter query: `WHERE centroid_lat IS NOT NULL` |

---

## Test Strategy for Story 1.7

### Approach

Testing n8n workflows is unique. We cannot easily write Jest unit tests for the n8n visual nodes. Instead, we use **Integration Tests** that trigger the workflows via n8n's webhook/CLI (or manual UI triggers during dev) and assert the result in the PostgreSQL database using Prisma.

**Tools:**
- **Trigger:** n8n UI (Manual execution for dev) or `curl` to n8n webhook test URL.
- **Assertion:** Jest + Prisma Client (Query the DB to verify data arrived).

**Test files location:** `apps/web/src/__tests__/infrastructure/n8n/`

---

## Test Cases

### TC-1.7-01: FxRate_Sync Execution & Persistence

**Type:** Integration
**Tool:** Jest + Prisma
**Priority:** P0

**Test Concept:**
1. Manually trigger the `FxRate_Sync` workflow in n8n UI (or use a test webhook).
2. Wait 5 seconds.
3. Query the `FxRate` table in Prisma.

```typescript
// __tests__/infrastructure/n8n/fxrate.test.ts
import { prisma } from '@/infrastructure/db/prisma.client'

describe('FxRate_Sync Workflow', () => {
  it('fetches and stores USD/VND rate', async () => {
    // Assuming the workflow was just triggered manually or via webhook setup
    const rate = await prisma.fxRate.findFirst({
      where: { currency_pair: 'USD/VND' },
      orderBy: { fetched_at: 'desc' }
    })
    
    expect(rate).toBeDefined()
    expect(rate?.rate).toBeGreaterThan(20000) // Sanity check for VND
    
    // Check if it's recent (e.g., fetched today)
    const today = new Date()
    expect(rate?.fetched_at.toDateString()).toBe(today.toDateString())
  })
})
```

**Pass Criteria:** DB contains a recent, plausible exchange rate.
**Fail Criteria:** DB is empty or data is stale.

---

### TC-1.7-02: OpenMeteo_Sync Batch Processing

**Type:** Integration
**Tool:** Jest + Prisma
**Priority:** P1

**Test Concept:**
1. Ensure the DB has at least 2 Parcels with valid `centroid_lat`/`lng`.
2. Trigger the `OpenMeteo_Sync` workflow.
3. Query `WeatherCache` table.

```typescript
// __tests__/infrastructure/n8n/openmeteo.test.ts
import { prisma } from '@/infrastructure/db/prisma.client'

describe('OpenMeteo_Sync Workflow', () => {
  it('caches weather for all valid parcels', async () => {
    const parcels = await prisma.parcel.findMany({
      where: { centroid_lat: { not: null } }
    })
    
    expect(parcels.length).toBeGreaterThan(0) // Ensure seed data exists
    
    for (const parcel of parcels) {
      const weather = await prisma.weatherCache.findFirst({
        where: { parcel_id: parcel.id },
        orderBy: { recorded_at: 'desc' }
      })
      
      expect(weather).toBeDefined()
      expect(weather?.temperature_c).toBeDefined()
      expect(weather?.source).toBe('open-meteo')
    }
  })
})
```

**Pass Criteria:** Every valid parcel has a corresponding weather cache entry.
**Fail Criteria:** Missing weather data for some/all parcels.

---

### TC-1.7-03: Upsert Idempotency (ON CONFLICT)

**Type:** Integration
**Tool:** Jest + Prisma
**Priority:** P0

**Test Concept:**
Trigger the `FxRate_Sync` workflow twice in rapid succession. It should update the existing record (or ignore) rather than creating a duplicate, because the date/pair combination should be unique.

**Pass Criteria:** Row count for today's USD/VND rate remains 1.
**Fail Criteria:** Duplicate rows appear, or Postgres throws a Unique Constraint violation that crashes the workflow.

---

## Test Execution Plan

```
P0 (blocking):
  TC-1.7-01 → TC-1.7-03

P1 (important):
  TC-1.7-02
```

---

## Definition of Done for Story 1.7

- [ ] `TC-1.7-01` PASS: FxRate data appears in DB.
- [ ] `TC-1.7-02` PASS: Weather data appears in DB for seeded parcels.
- [ ] `TC-1.7-03` PASS: Workflows can be run multiple times safely (idempotent).
- [ ] The 3 JSON workflow files are committed to `workflows/`.
- [ ] Committed with: `feat(n8n): add market data and weather sync pipelines`

---

*🧪 Murat notes: Testing n8n flows is tricky because they are visual. The exported JSON files are our source of truth. Always test the side-effects (the database writes) rather than trying to unit-test the n8n nodes themselves.*
