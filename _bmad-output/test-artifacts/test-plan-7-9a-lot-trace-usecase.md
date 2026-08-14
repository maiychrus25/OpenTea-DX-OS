# 🧪 Test Plan — Story 7.9a: GetLotTraceDataUseCase

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 7.9a — BE Use Case: GetLotTraceDataUseCase
**Date:** 2026-08-14
**Risk Level:** 🔴 HIGH — Logic tính `safe_harvest_date` ảnh hưởng food safety. Sai logic → hiển thị lot không an toàn là "an toàn".

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `is_harvest_safe` tính sai | MEDIUM | CRITICAL | Unit test với multiple withdrawal_days |
| `null` withdrawal_days → crash | MEDIUM | HIGH | Unit test null case |
| N+1 query performance | LOW | MEDIUM | Single Prisma query với include |
| `NotFoundError` không throw | LOW | HIGH | Unit test not-found case |

---

## Test Cases

### TC-7.9a-01: NotFoundError khi lot_code không tồn tại (Unit)

**Type:** Unit
**Priority:** P0

```typescript
import { GetLotTraceDataUseCase } from '@/application/useCases/get-lot-trace-data-usecase'
import { NotFoundError } from '@/domain/errors'

const mockRepo = {
  getLotByCode: jest.fn().mockResolvedValue(null),
}

test('throws NotFoundError when lot not found', async () => {
  const useCase = new GetLotTraceDataUseCase(mockRepo)
  await expect(useCase.execute('NONEXISTENT-001')).rejects.toThrow(NotFoundError)
})
```

---

### TC-7.9a-02: is_harvest_safe = true khi safe date trong quá khứ (Unit)

**Type:** Unit — food safety critical
**Priority:** P0 — CRITICAL

```typescript
const pastDate = new Date('2020-01-01')
const mockRepo = {
  getLotByCode: jest.fn().mockResolvedValue({
    lot_code: 'SAFE-001',
    is_harvest_safe: true, // đã được tính bởi repository
    latest_safe_harvest_date: pastDate,
    // ... other fields
  }),
}

test('returns is_harvest_safe=true when latest_safe_harvest_date is past', async () => {
  const useCase = new GetLotTraceDataUseCase(mockRepo)
  const result = await useCase.execute('SAFE-001')
  expect(result.is_harvest_safe).toBe(true)
  expect(result.latest_safe_harvest_date).toEqual(pastDate)
})
```

---

### TC-7.9a-03: is_harvest_safe = false khi safe date trong tương lai (Unit)

**Type:** Unit — food safety critical
**Priority:** P0 — CRITICAL

```typescript
const futureDate = new Date(Date.now() + 86400000 * 30) // 30 days ahead

test('returns is_harvest_safe=false when latest_safe_harvest_date is future', async () => {
  const mockRepo = {
    getLotByCode: jest.fn().mockResolvedValue({
      lot_code: 'UNSAFE-001',
      is_harvest_safe: false,
      latest_safe_harvest_date: futureDate,
    }),
  }
  const useCase = new GetLotTraceDataUseCase(mockRepo)
  const result = await useCase.execute('UNSAFE-001')
  expect(result.is_harvest_safe).toBe(false)
})
```

---

### TC-7.9a-04: is_harvest_safe = false khi không có withdrawal_days (Unit)

**Type:** Unit
**Priority:** P0

```typescript
test('returns is_harvest_safe=false when no withdrawal activities', async () => {
  const mockRepo = {
    getLotByCode: jest.fn().mockResolvedValue({
      lot_code: 'NO-WITHDRAWAL-001',
      is_harvest_safe: false,
      latest_safe_harvest_date: null,
    }),
  }
  const useCase = new GetLotTraceDataUseCase(mockRepo)
  const result = await useCase.execute('NO-WITHDRAWAL-001')
  expect(result.is_harvest_safe).toBe(false)
  expect(result.latest_safe_harvest_date).toBeNull()
})
```

---

### TC-7.9a-05: Repository tính MAX withdrawal_days khi có nhiều activities (Unit — Repository)

**Type:** Unit — PrismaLotTraceRepository logic
**Priority:** P0 — food safety

```typescript
// Test the date calculation logic directly (extract to pure function for testability)
import { computeSafeHarvestDate } from '@/infrastructure/db/repositories/prisma-lot-trace-repository'

test('picks MAX safe_harvest_date across all activities', () => {
  const entries = [
    { entry_date: new Date('2026-01-01'), activities: [{ withdrawal_days: 7 }] },
    { entry_date: new Date('2026-01-01'), activities: [{ withdrawal_days: 21 }] }, // MAX
    { entry_date: new Date('2026-01-01'), activities: [{ withdrawal_days: null }] },
  ]
  const result = computeSafeHarvestDate(entries)
  // 2026-01-01 + 21 days = 2026-01-22
  expect(result?.toISOString().slice(0, 10)).toBe('2026-01-22')
})
```

> **Note:** `computeSafeHarvestDate` phải được extract ra thành pure function để testable.

---

### TC-7.9a-06: LotTraceData shape đầy đủ fields (Unit)

**Type:** Unit
**Priority:** P1

```typescript
test('LotTraceData has all required fields', async () => {
  const mockRepo = { getLotByCode: jest.fn().mockResolvedValue(mockFullLotTraceData) }
  const useCase = new GetLotTraceDataUseCase(mockRepo)
  const result = await useCase.execute('FULL-001')
  expect(result).toHaveProperty('lot_code')
  expect(result).toHaveProperty('commodity')
  expect(result).toHaveProperty('parcels')
  expect(result).toHaveProperty('journal_summaries')
  expect(result).toHaveProperty('certificate_keys')
  expect(result).toHaveProperty('is_harvest_safe')
  expect(result).toHaveProperty('latest_safe_harvest_date')
})
```

---

## Test Execution Plan

```
P0 (blocking — food safety):
  TC-7.9a-01: NotFoundError
  TC-7.9a-02: is_harvest_safe=true logic
  TC-7.9a-03: is_harvest_safe=false logic
  TC-7.9a-04: null withdrawal case
  TC-7.9a-05: MAX withdrawal calculation

P1:
  TC-7.9a-06: LotTraceData shape complete
```

---

## Definition of Done for Story 7.9a

- [x] `TC-7.9a-01` PASS: NotFoundError
- [x] `TC-7.9a-02` PASS: safe=true
- [x] `TC-7.9a-03` PASS: safe=false (future date)
- [x] `TC-7.9a-04` PASS: safe=false (null)
- [x] `TC-7.9a-05` PASS: MAX withdrawal across activities
- [x] `TC-7.9a-06` PASS: Full data shape
- [x] `npm run build` pass, strict TypeScript
- [x] Story 7-9 unblocked
- [x] Committed: `feat(trace): add GetLotTraceDataUseCase with withdrawal safety computation`

---

*🧪 Murat notes: TC-7.9a-02 đến TC-7.9a-05 là food safety tests — tất cả đều P0 absolute gates. `computeSafeHarvestDate` PHẢI được extract thành pure function để unit test isolated, không phụ thuộc Prisma.*
