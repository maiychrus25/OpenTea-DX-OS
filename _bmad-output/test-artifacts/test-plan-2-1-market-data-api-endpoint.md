# 🧪 Test Plan — Story 2.1: Market Data API Endpoint & Use Case

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 2.1 — Market Data API Endpoint & Use Case
**Date:** 2026-08-05
**Risk Level:** 🟢 LOW — Standard read-only API endpoint using existing hexagonal pattern.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Prisma `distinct` query incorrect | MEDIUM | MEDIUM | Integration test validating returned rows |
| Missing validation on `commodity` param | LOW | LOW | Use Case rejects missing param |
| Domain layer imports Prisma | LOW | HIGH | Script from Story 1.4 will catch it |

---

## Test Strategy for Story 2.1

### Approach

We will rely on **Unit Tests** for the Use Cases (mocking the repositories) and **Integration Tests** for the API routes. We don't need UI E2E tests yet because the UI to consume this API isn't built yet (Story 2.2).

**Test files location:** `apps/web/src/__tests__/application/useCases/` and `apps/web/src/__tests__/presentation/api/`

---

## Test Cases

### TC-2.1-01: GetMarketDataUseCase (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P1

```typescript
// __tests__/application/useCases/GetMarketDataUseCase.test.ts
import { GetMarketDataUseCase } from '@/application/useCases/GetMarketDataUseCase'
import { IMarketDataRepository } from '@/domain/repositories/IMarketDataRepository'

describe('GetMarketDataUseCase', () => {
  it('returns latest data when history is not requested', async () => {
    const mockData = [{ id: '1', commodity: 'Gạo', value: 15000 }] as any
    const mockRepo: IMarketDataRepository = {
      getLatestMarketData: jest.fn().mockResolvedValue(mockData),
      getHistoricalMarketData: jest.fn()
    }
    
    const useCase = new GetMarketDataUseCase(mockRepo)
    const result = await useCase.execute('Gạo')

    expect(result).toEqual(mockData)
    expect(mockRepo.getLatestMarketData).toHaveBeenCalledWith('Gạo')
  })

  it('calls history method when history parameter is passed', async () => {
    const mockRepo: IMarketDataRepository = {
      getLatestMarketData: jest.fn(),
      getHistoricalMarketData: jest.fn().mockResolvedValue([])
    }
    
    const useCase = new GetMarketDataUseCase(mockRepo)
    await useCase.execute('Gạo', 30)

    expect(mockRepo.getHistoricalMarketData).toHaveBeenCalledWith('Gạo', 30)
  })
})
```

**Pass Criteria:** Correct repository method is called based on parameters.
**Fail Criteria:** Calls wrong method or fails to pass parameters.

---

### TC-2.1-02: API Route Responses (Integration)

**Type:** Integration
**Tool:** Jest (Mocking `Request`)
**Priority:** P0

**Test Concept:**
Test `src/app/api/market-data/route.ts` with valid and invalid query parameters.

**Pass Criteria:** Returns 200 OK with data array, or 400 Bad Request if `commodity` param is missing.
**Fail Criteria:** Returns 500.

---

## Test Execution Plan

```
P0: TC-2.1-02
P1: TC-2.1-01
```

---

## Definition of Done for Story 2.1

- [ ] `TC-2.1-01` PASS: Use Case logic behaves correctly.
- [ ] `TC-2.1-02` PASS: API routes respond correctly to HTTP requests.
- [ ] Committed with: `feat(market): add market data and fx rate use cases and api endpoints`

---

*🧪 Murat notes: Low risk story, but make sure the Prisma `distinct` query correctly isolates the latest record for EACH source+metric combination. Don't just return the latest 1 record overall.*
