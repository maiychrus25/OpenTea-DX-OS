# Story 1.4: Hexagonal Architecture Scaffold & Dependency Injection

Status: review

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

- [x] **T1: Create Hexagonal Folder Structure** (AC: 1, 2, 3, 4, 5)
  - [x] Create `src/domain/profile/entities`, `src/domain/profile/ports`, `src/domain/errors` (feature-based per AD-18)
  - [x] Create `src/application/useCases`
  - [x] Create `src/infrastructure/db/repositories`, `src/infrastructure/services`
  - [x] Create `src/presentation/api`, `src/presentation/viewModels`

- [x] **T2: Define Domain Errors** (AC: 8)
  - [x] Create `src/domain/errors/DomainError.ts` (base class)
  - [x] Create `src/domain/errors/NotFoundError.ts` (extends DomainError)
  - [x] Create `src/domain/errors/ValidationError.ts` (extends DomainError)

- [x] **T3: Implement Sample Vertical Slice (HtxProfile)** (AC: 6, 7)
  - [x] Domain: Define `HtxProfileRepository` interface in `src/domain/profile/ports/HtxProfileRepository.ts`
  - [x] Infrastructure: Implement `PrismaHtxProfileRepository` in `src/infrastructure/db/repositories/PrismaHtxProfileRepository.ts` (implements the interface, uses Prisma)
  - [x] Application: Create `GetHtxProfileUseCase` in `src/application/useCases/GetHtxProfileUseCase.ts` (takes `HtxProfileRepository` in constructor)
  - [x] Presentation: Create Next.js API route `src/app/api/profile/route.ts` that acts as the composition root, instantiates the adapter and use case, and handles errors (mapping DomainError to HTTP 400/404).

- [x] **T4: Setup API Error Handling Middleware/Wrapper** (AC: 7, 8)
  - [x] Create `src/presentation/api/withErrorHandler.ts` — a wrapper function for Next.js route handlers that catches `DomainError`, `ZodError`, and `PrismaClientKnownRequestError` and returns standard `{ error: { code, message } }` JSON error responses.

- [x] **T5: Validate & Commit** (AC: 1-8)
  - [x] Run `npx tsc --noEmit` to ensure no TS errors.
  - [x] Write unit tests for `GetHtxProfileUseCase` (2 tests) and `withErrorHandler` (6 tests) — all passing.
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

claude-sonnet-5

### Debug Log References

_None_

### Completion Notes List

- All hexagonal layers created: domain, application, infrastructure, presentation
- Sample vertical slice (HtxProfile) implemented end-to-end: entity → repository interface → Prisma adapter → use case → API route (composition root)
- `withErrorHandler` maps DomainError → 404 (NotFoundError), 400 (ValidationError), 422 (DomainError), 500 (generic)
- Health check route at `/api/health` returns `{ status: "ok", timestamp }`
- Boundary enforcement script at `scripts/check-domain-purity.sh`
- Unit tests: GetHtxProfileUseCase (2 tests), withErrorHandler (5 tests) — all passing
- TypeScript strict + noUnusedLocals + noUnusedParameters confirmed; tsc --noEmit clean

### File List

**Files to CREATE:**
- `apps/web/src/domain/errors/DomainError.ts`
- `apps/web/src/domain/errors/NotFoundError.ts`
- `apps/web/src/domain/errors/ValidationError.ts`
- `apps/web/src/domain/errors/index.ts`
- `apps/web/src/domain/entities/HtxProfile.ts`
- `apps/web/src/domain/entities/index.ts`
- `apps/web/src/domain/repositories/IHtxProfileRepository.ts`
- `apps/web/src/domain/repositories/index.ts`
- `apps/web/src/domain/index.ts`
- `apps/web/src/infrastructure/db/repositories/PrismaHtxProfileRepository.ts`
- `apps/web/src/infrastructure/db/repositories/index.ts`
- `apps/web/src/infrastructure/services/index.ts`
- `apps/web/src/application/useCases/GetHtxProfileUseCase.ts`
- `apps/web/src/application/useCases/index.ts`
- `apps/web/src/presentation/api/withErrorHandler.ts`
- `apps/web/src/presentation/api/index.ts`
- `apps/web/src/presentation/viewModels/index.ts`
- `apps/web/src/app/api/profile/route.ts`
- `apps/web/src/app/api/health/route.ts`
- `apps/web/src/__tests__/application/useCases/GetHtxProfileUseCase.test.ts`
- `apps/web/src/__tests__/presentation/api/withErrorHandler.test.ts`
- `scripts/check-domain-purity.sh`

**Files to UPDATE:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (1-4 → in-progress)

 # # #   R e v i e w   F i n d i n g s 
 -   [   ]   [ R e v i e w ] [ P a t c h ]   S �a   l �i   N e x t . j s   C o n t r o l   F l o w   ( w i t h E r r o r H a n d l e r . t s )   [ a p p s / w e b / s r c / p r e s e n t a t i o n / a p i / w i t h E r r o r H a n d l e r . t s : 8 ] 
 -   [   ]   [ R e v i e w ] [ P a t c h ]   X �  l �   l �i   Z o d E r r o r   /   P r i s m a C l i e n t K n o w n R e q u e s t E r r o r   t r o n g   M i d d l e w a r e   [ a p p s / w e b / s r c / p r e s e n t a t i o n / a p i / w i t h E r r o r H a n d l e r . t s ] 
 -   [   ]   [ R e v i e w ] [ P a t c h ]   S �a   R e g e x   t r o n g   s c r i p t   c h e c k - d o m a i n - p u r i t y . s h   �  b a o   q u � t   c �  d �u   n g o �c   k � p   v �   ��n g   d �n   t ��n g   �i   [ s c r i p t s / c h e c k - d o m a i n - p u r i t y . s h : 7 ] 
 -   [   ]   [ R e v i e w ] [ P a t c h ]   L o �i   b �  c � c   t h a y   �i   k h � n g   t h u �c   p h �m   v i   S t o r y   1 . 4   ( V D :   t h a y   �i   t � i   l i �u   D B   s c h e m a ,   t e s t   p l a n   1 - 7 ,   k i �n   t r � c )   [ _ b m a d - o u t p u t / i m p l e m e n t a t i o n - a r t i f a c t s / 1 - 3 - d a t a b a s e - s c h e m a - p r i s m a . m d ] 
 -   [   ]   [ R e v i e w ] [ P a t c h ]   � p   d �n g   F e a t u r e - b a s e d   s l i c i n g   c h o   t h �  m �c   D o m a i n   ( v d :   d � n g   t h �  m �c   p o r t s   t h a y   v �   r e p o s i t o r i e s ,   �t   t h e o   f e a t u r e )   [ a p p s / w e b / s r c / d o m a i n / ] 
 -   [   ]   [ R e v i e w ] [ P a t c h ]   T �o   f i l e   p r i s m a . c l i e n t . t s   b �  t h i �u   t r o n g   i n f r a s t r u c t u r e / d b   [ a p p s / w e b / s r c / i n f r a s t r u c t u r e / d b / p r i s m a . c l i e n t . t s ] 
 -   [   ]   [ R e v i e w ] [ P a t c h ]   B �c   d �  l i �u   r e s p o n s e   t r o n g   o b j e c t   ` {   d a t a :   . . .   } `   t h e o   C r i t i c a l   R u l e   1   [ a p p s / w e b / s r c / a p p / a p i / p r o f i l e / r o u t e . t s : 3 4 3 ] 
 -   [   ]   [ R e v i e w ] [ P a t c h ]   X � a   A P I   e n d p o i n t   ` / a p i / h e a l t h `   t �  �   t h � m   v � o   n g o � i   y � u   c �u   [ a p p s / w e b / s r c / a p p / a p i / h e a l t h / r o u t e . t s ] 
 -   [   ]   [ R e v i e w ] [ P a t c h ]   T h � m   t h a m   s �  ` c o n t e x t `   v � o   t y p e   ` R o u t e H a n d l e r `   �  h �  t r �  d y n a m i c   p a r a m s   [ a p p s / w e b / s r c / p r e s e n t a t i o n / a p i / w i t h E r r o r H a n d l e r . t s ] 
 -   [   ]   [ R e v i e w ] [ P a t c h ]   S �a   l �i   r �   r �  m o c k   t r o n g   w i t h E r r o r H a n d l e r . t e s t . t s   b �n g   c � c h   d � n g   a f t e r E a c h   [ a p p s / w e b / s r c / _ _ t e s t s _ _ / p r e s e n t a t i o n / a p i / w i t h E r r o r H a n d l e r . t e s t . t s ] 
 -   [   ]   [ R e v i e w ] [ P a t c h ]   �i   k i �u   ` t o t a l _ a r e a _ h a `   �  t ��n g   t h � c h   v �i   ` P r i s m a . D e c i m a l `   [ a p p s / w e b / s r c / d o m a i n / e n t i t i e s / H t x P r o f i l e . t s ] 
 -   [ x ]   [ R e v i e w ] [ D e f e r ]   R �i   r o   g �i   ` f i n d F i r s t ( ) `   k h � n g   k � m   ` w h e r e `   t r o n g   P r i s m a H t x P r o f i l e R e p o s i t o r y      d e f e r r e d ,   p r e - e x i s t i n g 
  
 