# 🧪 Test Plan — Story 1.4: Hexagonal Architecture Scaffold

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 1.4 — Hexagonal Architecture Scaffold & Dependency Injection
**Date:** 2026-08-05
**Risk Level:** 🟠 HIGH — Architectural scaffolding sets the pattern for all future backend code. If the domain layer is contaminated, the entire hexagonal benefit is lost.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Domain layer imports Prisma or Next.js | HIGH | HIGH | ESLint rules or static analysis script |
| Use Case creates its own dependencies (tight coupling) | MEDIUM | HIGH | Code review + strict constructor injection |
| `withErrorHandler` drops original error trace | LOW | MEDIUM | Ensure it logs `error` before returning HTTP response |
| API Route forgets to inject dependency | LOW | HIGH | TypeScript compilation will fail |

---

## Test Strategy for Story 1.4

### Approach

This story is about enforcing architectural boundaries. Testing focuses on **static analysis** (boundary enforcement) and **unit testing** (mockability of Use Cases). We will write a script to enforce boundaries and a unit test for the sample Use Case to prove it's decoupled.

**Tools:**
- **Boundary Enforcement:** Shell script (grep) or ESLint `no-restricted-imports`
- **Unit Testing:** Jest

**Test files location:** `apps/web/src/__tests__/architecture/` and `apps/web/src/__tests__/application/useCases/`

---

## Test Cases

### TC-1.4-01: Domain Layer Purity (Boundary Enforcement)

**Type:** Static Analysis
**Tool:** Shell Script
**Priority:** P0

**Script (`scripts/check-domain-purity.sh`):**
```bash
#!/bin/bash
echo "=== Checking Domain Layer Purity ==="

# 1. Domain should not import anything from application, infrastructure, or presentation
VIOLATIONS=$(grep -rn "from '@/application" src/domain/ --include="*.ts" || true)
VIOLATIONS+=$(grep -rn "from '@/infrastructure" src/domain/ --include="*.ts" || true)
VIOLATIONS+=$(grep -rn "from '@/presentation" src/domain/ --include="*.ts" || true)

# 2. Domain should not import Next.js or Prisma
VIOLATIONS+=$(grep -rn "from 'next" src/domain/ --include="*.ts" || true)
VIOLATIONS+=$(grep -rn "from '@prisma" src/domain/ --include="*.ts" || true)

if [ -n "$VIOLATIONS" ]; then
  echo "❌ Domain purity violations found:"
  echo "$VIOLATIONS"
  exit 1
else
  echo "✅ Domain layer is pure"
  exit 0
fi
```

**Pass Criteria:** Script exits 0. No invalid imports in `src/domain/`.
**Fail Criteria:** Any import from outside the domain layer (except standard libraries or types).

---

### TC-1.4-02: Use Case Mockability (Unit Test)

**Type:** Unit
**Tool:** Jest
**Priority:** P0

```typescript
// __tests__/application/useCases/GetHtxProfileUseCase.test.ts
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { IHtxProfileRepository } from '@/domain/repositories/IHtxProfileRepository'
import { NotFoundError } from '@/domain/errors'

describe('GetHtxProfileUseCase', () => {
  it('returns profile when found', async () => {
    // 1. Arrange: Create a mock repository
    const mockProfile = { id: 'test-id', name: 'Test HTX' }
    const mockRepo: IHtxProfileRepository = {
      getProfile: jest.fn().mockResolvedValue(mockProfile)
    }
    
    const useCase = new GetHtxProfileUseCase(mockRepo)

    // 2. Act
    const result = await useCase.execute()

    // 3. Assert
    expect(result).toEqual(mockProfile)
    expect(mockRepo.getProfile).toHaveBeenCalledTimes(1)
  })

  it('throws NotFoundError when profile is missing', async () => {
    const mockRepo: IHtxProfileRepository = {
      getProfile: jest.fn().mockResolvedValue(null)
    }
    
    const useCase = new GetHtxProfileUseCase(mockRepo)

    await expect(useCase.execute()).rejects.toThrow(NotFoundError)
  })
})
```

**Pass Criteria:** Tests pass, proving the Use Case can be tested purely with mocks without any database connection.
**Fail Criteria:** Tests fail or require a real Prisma client to run.

---

### TC-1.4-03: API Error Handler Mapping

**Type:** Unit
**Tool:** Jest
**Priority:** P1

```typescript
// __tests__/presentation/api/withErrorHandler.test.ts
import { withErrorHandler } from '@/presentation/api/withErrorHandler'
import { NotFoundError, ValidationError, DomainError } from '@/domain/errors'
import { NextResponse } from 'next/server'

describe('withErrorHandler', () => {
  it('maps NotFoundError to 404', async () => {
    const handler = withErrorHandler(async () => {
      throw new NotFoundError('Item not found')
    })
    
    const response = await handler(new Request('http://localhost'))
    expect(response.status).toBe(404)
    
    const data = await response.json()
    expect(data.error).toBe('Item not found')
  })

  it('maps ValidationError to 400', async () => {
    const handler = withErrorHandler(async () => {
      throw new ValidationError('Invalid input')
    })
    
    const response = await handler(new Request('http://localhost'))
    expect(response.status).toBe(400)
  })

  it('maps generic Error to 500', async () => {
    const handler = withErrorHandler(async () => {
      throw new Error('Kaboom')
    })
    
    // Suppress console.error for this expected error test
    jest.spyOn(console, 'error').mockImplementation(() => {})
    
    const response = await handler(new Request('http://localhost'))
    expect(response.status).toBe(500)
    
    jest.restoreAllMocks()
  })
})
```

**Pass Criteria:** Custom domain errors correctly map to standard HTTP status codes.
**Fail Criteria:** Returns 500 for expected domain errors.

---

### TC-1.4-04: API Composition Root (Integration)

**Type:** Integration
**Tool:** Jest (or manual testing via Next.js dev server)
**Priority:** P1

**Steps:**
1. Start the Next.js dev server connected to a seeded database.
2. Send a GET request to `/api/profile`.

**Pass Criteria:** Returns HTTP 200 with the HTX profile data from the database.
**Fail Criteria:** Returns 500 or fails to instantiate the Prisma adapter.

---

## Test Execution Plan

```
P0 (blocking):
  TC-1.4-01 → TC-1.4-02

P1 (important):
  TC-1.4-03 → TC-1.4-04
```

**CI Integration:** Add `scripts/check-domain-purity.sh` to the main CI pipeline script (`smoke-test.sh` or a new `lint.sh`).

---

## Definition of Done for Story 1.4

- [ ] `TC-1.4-01` PASS: Domain layer purity script confirms no invalid imports.
- [ ] `TC-1.4-02` PASS: Sample Use Case unit tests pass using mocked repository.
- [ ] `TC-1.4-03` PASS: `withErrorHandler` unit tests pass.
- [ ] `TC-1.4-04` PASS: `/api/profile` route works end-to-end.
- [ ] `scripts/check-domain-purity.sh` created and committed.
- [ ] Committed with: `feat(arch): scaffold hexagonal architecture and implement sample profile slice`

---

*🧪 Murat notes: Hexagonal architecture is great, but only if we strictly enforce it. The boundary enforcement script (TC-1.4-01) is the most critical deliverable here. Without it, developers will slowly leak Prisma back into the domain layer.*
