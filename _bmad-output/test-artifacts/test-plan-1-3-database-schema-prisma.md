# 🧪 Test Plan — Story 1.3: Database Schema & Prisma Setup

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 1.3 — Database Schema & Prisma Setup
**Date:** 2026-08-05
**Risk Level:** 🔴 HIGH — Database schema is the core data model. Mistakes here require costly migrations later.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Missing foreign keys or relations | LOW | HIGH | Prisma schema validation prevents this |
| Incorrect field types (e.g., Float vs Int) | MEDIUM | MEDIUM | Code review + automated DB schema tests |
| Missing unique constraints | MEDIUM | HIGH | Explicit tests for unique constraints |
| Prisma Client instantiation leak (OOM) | HIGH | CRITICAL | Test singleton pattern behavior |
| Seed script not idempotent | HIGH | MEDIUM | Run seed script twice and assert counts |
| Circular dependencies in schema | LOW | HIGH | `prisma validate` catches this |
| Missing indexes on frequently queried fields | MEDIUM | MEDIUM | Code review + check schema for `@@index` |

---

## Test Strategy for Story 1.3

### Approach

This story focuses on data modeling and infrastructure. Testing involves **static analysis** (schema validation), **migration testing** (can it deploy to an empty DB?), **integration testing** (can we query seeded data?), and **singleton verification** (is the client shared?).

**Tools:**
- **Schema Validation:** `npx prisma validate`
- **Migration & Seeding:** `npx prisma migrate reset --force`
- **Integration:** Jest + Prisma Client
- **Singleton:** Jest module loading tests

**Test files location:** `apps/web/src/__tests__/infrastructure/db/`

---

## Test Cases

### TC-1.3-01: Prisma Schema Validation & Compilation

**Type:** Static Analysis / Build
**Tool:** Prisma CLI
**Priority:** P0

**Steps:**
```bash
cd apps/web
npx prisma validate
npx prisma generate
```

**Pass Criteria:** Both commands exit with status 0. No validation errors or TypeScript generation errors.
**Fail Criteria:** Any error reported by Prisma CLI.

---

### TC-1.3-02: Initial Migration on Fresh Database

**Type:** Integration / DB Ops
**Tool:** Prisma CLI + PostgreSQL
**Priority:** P0

**Steps:**
1. Spin up a fresh PostgreSQL container or drop the existing `agrimarket` database.
2. Run `npx prisma migrate deploy`.
3. Connect to PostgreSQL and query `information_schema.tables`.

**Pass Criteria:**
- Migration command succeeds.
- All 15 required tables exist in the `public` schema.
- The `_prisma_migrations` table shows the initial migration applied successfully.

**Fail Criteria:** Migration fails or tables are missing.

---

### TC-1.3-03: Seed Script Idempotency

**Type:** Integration / Data
**Tool:** Prisma CLI
**Priority:** P1

**Steps:**
1. Ensure the DB is empty or migrated to the latest state.
2. Run `npx prisma db seed`.
3. Count rows in key tables: `HtxProfile` (should be 1), `Household` (should be 3), `Parcel` (should be 5).
4. Run `npx prisma db seed` a SECOND time.
5. Count rows again.

**Pass Criteria:**
- Seed script runs without errors both times.
- Row counts remain exactly the same after the second run (no duplicates created).

**Fail Criteria:** Script fails on second run (e.g., unique constraint violation) or creates duplicate records.

---

### TC-1.3-04: Prisma Client Singleton Behavior

**Type:** Unit
**Tool:** Jest
**Priority:** P0

```typescript
// __tests__/infrastructure/db/prisma.client.test.ts
import { prisma as prisma1 } from '@/infrastructure/db/prisma.client'

describe('Prisma Client Singleton', () => {
  it('should reuse the same instance', async () => {
    // Dynamically import to simulate a separate module loading
    const { prisma: prisma2 } = await import('@/infrastructure/db/prisma.client')
    
    expect(prisma1).toBe(prisma2)
  })

  it('should attach to globalThis in development', () => {
    // Assuming NODE_ENV is test or development during this run
    if (process.env.NODE_ENV !== 'production') {
      expect((globalThis as any).prisma).toBe(prisma1)
    }
  })
})
```

**Pass Criteria:** Both imports resolve to the exact same object reference in memory.
**Fail Criteria:** `prisma1 !== prisma2` (meaning a new connection pool would be created per request).

---

### TC-1.3-05: Relational Queries (Integration)

**Type:** Integration
**Tool:** Jest + Prisma Client
**Priority:** P1

```typescript
// __tests__/infrastructure/db/relations.test.ts
import { prisma } from '@/infrastructure/db/prisma.client'

describe('Database Relations', () => {
  beforeAll(async () => {
    // Ensure DB is seeded
    // await runSeed() if necessary, or assume test DB is seeded
  })

  it('can fetch a Household with its Parcels', async () => {
    const household = await prisma.household.findFirst({
      include: { parcels: true }
    })
    
    expect(household).toBeDefined()
    // Depending on seed data, they might not have parcels, but the query must succeed
    expect(Array.isArray(household?.parcels)).toBe(true)
  })

  it('can fetch a JournalEntry with its JournalActivities', async () => {
    // Even if empty, the include syntax must be valid and execute successfully
    const entry = await prisma.journalEntry.findFirst({
      include: { activities: true }
    })
    
    expect(entry).toBeDefined() // Might be null if no data, which is fine
  })
})
```

**Pass Criteria:** Complex relational queries compile (TS) and execute against the DB without SQL errors.
**Fail Criteria:** Prisma throws an error due to missing relations or invalid schema mapping.

---

### TC-1.3-06: Unique Constraints

**Type:** Integration
**Tool:** Jest + Prisma Client
**Priority:** P1

```typescript
// __tests__/infrastructure/db/constraints.test.ts
import { prisma } from '@/infrastructure/db/prisma.client'

describe('Database Constraints', () => {
  it('prevents duplicate Household phone numbers', async () => {
    const phone = '0999999999'
    
    // Create first
    await prisma.household.create({
      data: { name: 'Test 1', phone }
    })

    // Create second with same phone should throw
    await expect(
      prisma.household.create({
        data: { name: 'Test 2', phone }
      })
    ).rejects.toThrow(/Unique constraint failed on the fields: \(`phone`\)/)
  })
})
```

**Pass Criteria:** DB correctly rejects duplicates on fields marked `@unique` in the schema.
**Fail Criteria:** DB allows duplicate inserts.

---

## Test Execution Plan

```
P0 (blocking):
  TC-1.3-01 → TC-1.3-02 → TC-1.3-04

P1 (important):
  TC-1.3-03 → TC-1.3-05 → TC-1.3-06
```

**CI Integration:** Add DB setup and migration step to GitHub Actions before running tests.

---

## Definition of Done for Story 1.3

- [ ] `TC-1.3-01` PASS: Prisma schema validates and generates TS types cleanly.
- [ ] `TC-1.3-02` PASS: Initial migration deploys successfully to an empty DB.
- [ ] `TC-1.3-03` PASS: Seed script is idempotent and populates required dev data.
- [ ] `TC-1.3-04` PASS: Prisma Client is a true singleton in development.
- [ ] `TC-1.3-05` PASS: Relational queries execute successfully.
- [ ] `TC-1.3-06` PASS: Unique constraints are enforced by the DB.
- [ ] Committed with: `feat(db): add prisma schema with all domain models and seed data`

---

*🧪 Murat notes: Story 1.3 establishes the data contract. It is crucial that the seed script is robust (idempotent) so developers can reset their local DB state easily at any time. The singleton pattern for PrismaClient is non-negotiable in Next.js development mode, otherwise we'll exhaust connection pools instantly during hot reloads.*
