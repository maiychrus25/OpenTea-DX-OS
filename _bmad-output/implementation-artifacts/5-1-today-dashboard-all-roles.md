# Story 5.1: "Today" Dashboard (All Roles)

Status: ready-for-dev

## Story

As an authenticated User (Manager, Officer, or Farmer),
I want a dashboard tailored to my role when I log in,
so that I can immediately see the most important information for my day (market data, weather, tasks).

## Dependencies
- **Depends on:** Epic 2 (Auth/Roles), Epic 3 (Journals), Epic 4 (Lots).
- **Blocks:** None.

## Acceptance Criteria

1. **Given** I am logged in as a Farmer **When** I land on `/farmer` **Then** I see a widget with today's weather for my parcel (fetching from `WeatherCache`).
2. **Given** I am logged in as an Officer **When** I land on `/officer` **Then** I see the count of `PENDING` journals needing approval.
3. **Given** I am logged in as a Manager **When** I land on `/manager` **Then** I see total active farm zones, recent lots published, and the latest market prices (from the n8n DB tables).
4. **Given** the frontend architecture **When** building these dashboards **Then** use independent Server Components for widgets, grouped in the `(role)` route layouts.

## Hexagonal Architecture Design & Tasks

### 1. Application Layer (`src/application/`)
- [ ] **T1.1: Create Use Cases for Dashboards**
  - File: `src/application/useCases/dashboard/GetFarmerDashboardUseCase.ts` (Fetches WeatherCache, recent JournalEntries).
  - File: `src/application/useCases/dashboard/GetOfficerDashboardUseCase.ts` (Counts `JournalEntry` where `status = PENDING`).
  - File: `src/application/useCases/dashboard/GetManagerDashboardUseCase.ts` (Fetches `MarketData`, `FxRate`, count of `PUBLISHED` Lots).

### 2. Frontend UI Layer (`src/app/`)
- [ ] **T2.1: Implement Role Pages (Server Components)**
  - File: `src/app/(farmer)/page.tsx`
  - File: `src/app/(officer)/page.tsx`
  - File: `src/app/(manager)/page.tsx`
  - Logic: Each page calls its respective Use Case directly on the server (no `fetch` to API routes needed).

- [ ] **T2.2: Build Widget Components**
  - File: `src/components/features/dashboard/WeatherWidget.tsx` (Displays temp, humidity).
  - File: `src/components/features/dashboard/PendingApprovalsWidget.tsx` (Displays badge/count).
  - File: `src/components/features/dashboard/MarketSummaryWidget.tsx` (Displays list of prices).
  - Note: These widgets are pure UI components receiving data as props from the Server Page.

## Dev Notes
- **Performance:** Since these are Server Components fetching DB data on page load, ensure queries are optimized (use `.count()` instead of `findMany().length`). No caching is strictly required for MVP, but React's native `fetch` cache or unstable_cache can be used if DB load is a concern.
