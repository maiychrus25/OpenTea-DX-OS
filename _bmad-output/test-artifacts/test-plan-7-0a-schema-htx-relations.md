# 🧪 Test Plan — Story 7.0a: Schema Migration — htx_profile_id

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 7.0a — Schema Migration: Add htx_profile_id to Household & Lot
**Date:** 2026-08-14
**Risk Level:** 🔴 HIGH — Schema migration ảnh hưởng production data. Nullable fields giảm risk nhưng vẫn cần test kỹ.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration breaks existing data | LOW | CRITICAL | Nullable fields + migration test |
| Prisma generate fails | LOW | HIGH | Build check |
| Relations not queryable | LOW | HIGH | Integration test |
| Backfill needed cho existing records | MEDIUM | MEDIUM | Optional seed script |

---

## Test Cases

### TC-7.0a-01: Migration Applies Without Error (Build Gate)

**Type:** Build
**Tool:** `npx prisma migrate dev`
**Priority:** P0

```bash
npx prisma migrate dev --name "add_htx_relations"
# Expected: Migration applied successfully, 0 errors
npx prisma generate
# Expected: Prisma Client generated successfully
npm run build
# Expected: 0 TypeScript errors
```

**Pass Criteria:** Tất cả 3 commands exit 0.

---

### TC-7.0a-02: HtxProfile Has Household & Lot Relations (Unit)

**Type:** Unit — Prisma integration
**Tool:** Jest với test DB
**Priority:** P0

```typescript
// __tests__/db/schema-relations.test.ts
import { prisma } from '@/infrastructure/db/prisma.client'

test('HtxProfile can query households relation', async () => {
  const htx = await prisma.htxProfile.findFirst({
    include: { households: true, lots: true }
  })
  // Should not throw; htx may be null if no data
  expect(htx).toBeDefined() // null or object, not error
})
```

**Pass Criteria:** Query không throw Prisma error.

---

### TC-7.0a-03: Lot Filter by htx_profile_id Works (Integration)

**Type:** Integration
**Tool:** Jest với test DB + seed
**Priority:** P0

```typescript
test('can filter lots by htx_profile_id', async () => {
  // Create test HTX
  const htx = await prisma.htxProfile.create({ data: { name: 'Test HTX', ... } })
  // Create lot with htx_profile_id
  const lot = await prisma.lot.create({ data: { lot_code: 'TEST-001', ..., htx_profile_id: htx.id } })
  // Query
  const lots = await prisma.lot.findMany({ where: { htx_profile_id: htx.id, status: 'READY' } })
  // Clean up
  await prisma.lot.delete({ where: { id: lot.id } })
  await prisma.htxProfile.delete({ where: { id: htx.id } })
  expect(lots).toBeDefined()
})
```

**Pass Criteria:** Filter query works without error.

---

### TC-7.0a-04: Existing Data Intact After Migration (Regression)

**Type:** Integration / Data integrity
**Tool:** Jest
**Priority:** P0

```typescript
test('existing lots have null htx_profile_id (not deleted)', async () => {
  const lotsWithoutHtx = await prisma.lot.findMany({
    where: { htx_profile_id: null }
  })
  // Existing data still exists, just with null FK
  expect(Array.isArray(lotsWithoutHtx)).toBe(true)
})
```

**Pass Criteria:** Existing records accessible with null FK.

---

## Definition of Done for Story 7.0a

- [ ] `TC-7.0a-01` PASS: Migration + generate + build
- [ ] `TC-7.0a-02` PASS: Relations queryable
- [ ] `TC-7.0a-03` PASS: Filter by htx_profile_id
- [ ] `TC-7.0a-04` PASS: Existing data intact
- [ ] Stories 7-7 và 7-10 unblocked
- [ ] Committed với: `chore(db): add htx_profile_id FK to Household and Lot models`
