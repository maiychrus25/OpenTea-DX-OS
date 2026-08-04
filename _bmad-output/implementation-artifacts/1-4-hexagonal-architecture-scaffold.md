# Story 1.4: Hexagonal Architecture Scaffold & Dependency Injection

Status: ready-for-dev

## Story

As a developer,
I want the base folder structure and dependency injection wiring for the Hexagonal Architecture set up,
so that all future feature implementations have a clear place to put their domain logic, use cases, and infrastructure adapters without coupling to the Next.js framework.

## Dependencies
- **Depends on:** 1.3
- **Blocks:** 1.5

## Acceptance Criteria

1. **Given** the `apps/web/src` folder **When** inspected **Then** it contains the core hexagonal folders: `domain/`, `application/`, `infrastructure/`, and `presentation/`
2. **Given** `src/domain/` **When** inspected **Then** it contains `entities/` (types/interfaces), `repositories/` (interfaces for data access), and `errors/` (custom domain error classes)
3. **Given** `src/application/` **When** inspected **Then** it contains `useCases/` (classes or functions implementing business logic)
4. **Given** `src/infrastructure/` **When** inspected **Then** it contains `db/` (Prisma client and repositories implementing domain interfaces) and `services/` (external API adapters)
5. **Given** `src/presentation/` **When** inspected **Then** it contains `api/` (Next.js route handlers) and `components/` (UI components - if not already in `src/components`)
6. **Given** a sample Use Case (e.g., `GetHtxProfileUseCase`) **When** it is executed **Then** it receives its dependencies (e.g., `IHtxProfileRepository`) via constructor injection (or higher-order functions) and does NOT import `prisma` directly.
7. **Given** a Next.js API route (e.g., `app/api/profile/route.ts`) **When** it receives a request **Then** it acts as the composition root: it instantiates the Prisma adapter, injects it into the Use Case, executes the Use Case, and returns the standard HTTP response.
8. **Given** `src/domain/errors/` **When** used **Then** it provides base classes like `DomainError`, `NotFoundError`, and `ValidationError` that Use Cases can throw and API routes can catch to return appropriate HTTP status codes (e.g., 404, 400).

## Tasks / Subtasks

- [ ] **T1: Create Hexagonal Folder Structure** (AC: 1, 2, 3, 4, 5)
  - [ ] Create `src/domain/entities`, `src/domain/repositories`, `src/domain/errors`
  - [ ] Create `src/application/useCases`
  - [ ] Create `src/infrastructure/db/repositories`, `src/infrastructure/services`
  - [ ] Create `src/presentation/api`, `src/presentation/viewModels`

- [ ] **T2: Define Domain Errors** (AC: 8)
  - [ ] Create `src/domain/errors/DomainError.ts` (base class)
  - [ ] Create `src/domain/errors/NotFoundError.ts` (extends DomainError)
  - [ ] Create `src/domain/errors/ValidationError.ts` (extends DomainError)

- [ ] **T3: Implement Sample Vertical Slice (HtxProfile)** (AC: 6, 7)
  - [ ] Domain: Define `IHtxProfileRepository` interface in `src/domain/repositories/IHtxProfileRepository.ts`
  - [ ] Infrastructure: Implement `PrismaHtxProfileRepository` in `src/infrastructure/db/repositories/PrismaHtxProfileRepository.ts` (implements the interface, uses Prisma)
  - [ ] Application: Create `GetHtxProfileUseCase` in `src/application/useCases/GetHtxProfileUseCase.ts` (takes `IHtxProfileRepository` in constructor)
  - [ ] Presentation: Create Next.js API route `src/app/api/profile/route.ts` that acts as the composition root, instantiates the adapter and use case, and handles errors (mapping DomainError to HTTP 400/404).

- [ ] **T4: Setup API Error Handling Middleware/Wrapper** (AC: 7, 8)
  - [ ] Create `src/presentation/api/withErrorHandler.ts` — a wrapper function for Next.js route handlers that catches `DomainError` and returns standard JSON error responses.

- [ ] **T5: Validate & Commit** (AC: 1-8)
  - [ ] Run `npx tsc --noEmit` to ensure no TS errors.
  - [ ] Write a basic unit test for `GetHtxProfileUseCase` using a mocked repository.
  - [ ] Commit: `feat(arch): scaffold hexagonal architecture and implement sample profile slice`

## Dev Notes

### Architecture Constraints

```
AD-15: Hexagonal Architecture (Ports and Adapters)
- Domain Layer: PURE. No external dependencies (no Prisma, no Next.js).
- Application Layer: Orchestrates use cases. Depends ONLY on Domain.
- Infrastructure Layer: Implements Domain ports. Depends on external tools (Prisma).
- Presentation Layer: Next.js Routes/Pages. Acts as Composition Root.
```

### Dependency Injection Pattern

In Node.js/TypeScript, we will use simple Constructor Injection without a heavy DI container (like InversifyJS) for simplicity, unless the project complexity warrants it later. The Next.js API route or Server Action is the "Composition Root".

```typescript
// src/app/api/profile/route.ts (Composition Root)
import { NextResponse } from 'next/server'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { withErrorHandler } from '@/presentation/api/withErrorHandler'
import { prisma } from '@/infrastructure/db/prisma.client'

async function getProfileHandler(request: Request) {
  // 1. Instantiate Adapters
  const profileRepo = new PrismaHtxProfileRepository(prisma)
  
  // 2. Instantiate Use Case with Adapters injected
  const useCase = new GetHtxProfileUseCase(profileRepo)
  
  // 3. Execute
  const profile = await useCase.execute()
  
  return NextResponse.json(profile)
}

export const GET = withErrorHandler(getProfileHandler)
```

### Domain Error Handling

```typescript
// src/presentation/api/withErrorHandler.ts
import { NextResponse } from 'next/server'
import { DomainError, NotFoundError, ValidationError } from '@/domain/errors'

export function withErrorHandler(handler: (req: Request) => Promise<NextResponse>) {
  return async (req: Request) => {
    try {
      return await handler(req)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
      if (error instanceof ValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      if (error instanceof DomainError) {
        return NextResponse.json({ error: error.message }, { status: 422 })
      }
      // Unhandled/Unexpected error
      console.error('Unhandled API Error:', error)
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
  }
}
```

### References

- [Source: ARCHITECTURE-SPINE.md#AD-15] — Hexagonal Architecture Rule

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_None yet_

### Completion Notes List

_To be filled after implementation_

### File List

**Files to CREATE:**
- `apps/web/src/domain/errors/DomainError.ts`
- `apps/web/src/domain/errors/NotFoundError.ts`
- `apps/web/src/domain/errors/ValidationError.ts`
- `apps/web/src/domain/errors/index.ts`
- `apps/web/src/domain/repositories/IHtxProfileRepository.ts`
- `apps/web/src/infrastructure/db/repositories/PrismaHtxProfileRepository.ts`
- `apps/web/src/application/useCases/GetHtxProfileUseCase.ts`
- `apps/web/src/presentation/api/withErrorHandler.ts`
- `apps/web/src/app/api/profile/route.ts`

**Files to UPDATE:**
- N/A
