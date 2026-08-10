# Story 2.1: Market Data API Endpoint & Use Case

Status: ready-for-dev

## Story

As a developer,
I want an internal API endpoint and Use Case for retrieving historical and current market data (from the tables n8n populates),
so that the frontend dashboards can render charts and display current prices without directly querying the database.

## Dependencies
- **Depends on:** 1.7
- **Blocks:** 2.2

## Acceptance Criteria

1. **Given** the `MarketData` table is populated **When** a `GET /api/market-data?commodity=Gạo` request is made **Then** it returns the latest market data for that commodity across all metrics and sources.
2. **Given** the `MarketData` API endpoint **When** `GET /api/market-data?commodity=Gạo&history=30` is requested **Then** it returns a time-series array of data for the last 30 days, suitable for chart rendering.
3. **Given** the `FxRate` table **When** a `GET /api/market-data/fx` request is made **Then** it returns the latest exchange rates JSONB object (containing multiple currency pairs).
4. **Given** the Hexagonal Architecture **When** inspecting the implementation **Then** the logic is encapsulated in `GetMarketDataUseCase` and `GetFxRateUseCase`, with Prisma repository adapters reading the database.
5. **Given** the Next.js API routes **When** an unauthenticated user attempts to call them **Then** they receive a 200 OK (market data is public/tenant-wide for the HTX, no role restriction needed).

## Tasks / Subtasks

- [ ] **T1: Define Domain Interfaces & DTOs** (AC: 4)
  - [ ] Create `src/domain/repositories/IMarketDataRepository.ts`.
  - [ ] Define `getLatestMarketData(commodity: string): Promise<MarketData[]>` and `getHistoricalMarketData(commodity: string, days: number): Promise<MarketData[]>`.
  - [ ] Create `src/domain/repositories/IFxRateRepository.ts` with `getLatestRates(): Promise<FxRate | null>`.

- [ ] **T2: Implement Prisma Repositories** (AC: 4)
  - [ ] Create `src/infrastructure/db/repositories/PrismaMarketDataRepository.ts`.
  - [ ] Implement queries: `getLatestMarketData` uses `distinct: ['source', 'metric']` and `orderBy: { fetched_at: 'desc' }`.
  - [ ] Create `src/infrastructure/db/repositories/PrismaFxRateRepository.ts`.

- [ ] **T3: Implement Use Cases** (AC: 4)
  - [ ] Create `src/application/useCases/GetMarketDataUseCase.ts`. It takes `IMarketDataRepository` and optional parameters (commodity, history length).
  - [ ] Create `src/application/useCases/GetFxRateUseCase.ts`.

- [ ] **T4: Create API Routes** (AC: 1, 2, 3, 5)
  - [ ] Create `src/app/api/market-data/route.ts`. Parse search params `commodity` and `history`. Instantiate adapter and use case. Use `withErrorHandler`.
  - [ ] Create `src/app/api/market-data/fx/route.ts`. Parse JSONB rates and return.

- [ ] **T5: Validate & Commit**
  - [ ] Ensure `npx tsc --noEmit` passes.
  - [ ] Add basic unit tests for the Use Cases.
  - [ ] Commit: `feat(market): add market data and fx rate use cases and api endpoints`

## Dev Notes

### Architecture Constraints

- Strictly follow the Hexagonal pattern established in Story 1.4. The route handler instantiates the Prisma adapter and injects it into the Use Case.
- **Read-Only:** The Next.js application NEVER writes to `MarketData` or `FxRate`. These tables are populated exclusively by the n8n pipelines created in Story 1.7.

### Prisma Distinct Query

To get the *latest* entry for each metric/source combination in Prisma:

```typescript
const latestData = await prisma.marketData.findMany({
  where: { commodity },
  orderBy: { fetched_at: 'desc' },
  distinct: ['source', 'metric'],
})
```

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_None yet_

### Completion Notes List

_To be filled after implementation_

### File List

**Files to CREATE:**
- `apps/web/src/domain/repositories/IMarketDataRepository.ts`
- `apps/web/src/domain/repositories/IFxRateRepository.ts`
- `apps/web/src/infrastructure/db/repositories/PrismaMarketDataRepository.ts`
- `apps/web/src/infrastructure/db/repositories/PrismaFxRateRepository.ts`
- `apps/web/src/application/useCases/GetMarketDataUseCase.ts`
- `apps/web/src/application/useCases/GetFxRateUseCase.ts`
- `apps/web/src/app/api/market-data/route.ts`
- `apps/web/src/app/api/market-data/fx/route.ts`

**Files to UPDATE:**
- N/A
