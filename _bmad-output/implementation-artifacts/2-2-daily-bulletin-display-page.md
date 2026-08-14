# Story 2.2: Daily Bulletin Display Page

Status: ready-for-dev

> ⚠️ **DESIGN SYNC NOTE — 2026-08-14:**
> Nếu story này được redone hoặc refactor: route path dùng `manager/bulletin/page.tsx` (KHÔNG dùng `(manager)/bulletin/` route group). CSS tokens dùng `var(--foreground)`, `var(--card)`, `var(--border)` theo design system mới (7-1). `SourceBox` component (7-5) PHẢI được thêm vào khi hiển thị sources_json. `AiNote` (7-5) PHẢI có khi hiển thị AI-generated bulletin text.


## Story

As a Manager, Officer, or Farmer,
I want to view a daily agricultural market bulletin with summaries, key price indicators, and insights,
so that I can quickly understand market trends and make informed decisions without reading raw data tables.

## Dependencies
- **Depends on:** 2.1
- **Blocks:** 2.3

## Acceptance Criteria

1. **Given** I am logged in **When** I navigate to my role's Bulletin page (e.g., `/manager/bulletin`, `/farmer/bulletin`) **Then** I see the latest available `Bulletin` from the database.
2. **Given** the Bulletin page **When** I view it **Then** the UI displays: the date, the commodity name, the text summary (Markdown rendered to HTML), and a section showing the raw data sources that informed the bulletin (from `sources_json`).
3. **Given** the Bulletin page **When** the text summary contains citations like `[1]`, `[2]` **Then** these visually map to the listed sources below the text.
4. **Given** the Market Data API (Story 2.1) **When** the page renders **Then** it also displays a small "Thị trường hôm nay" (Market Today) widget showing the latest FX rate and key prices fetched via the API.
5. **Given** the `Bulletin` component **When** inspected **Then** the core display logic is extracted into a shared Client or Server component (`src/components/features/bulletin/BulletinView.tsx`) so it can be reused across different role layouts.

## Tasks / Subtasks

- [ ] **T1: Shared Bulletin Component** (AC: 2, 3, 5)
  - [ ] Create `src/components/features/bulletin/BulletinView.tsx` (and `.module.css`).
  - [ ] Accept a `Bulletin` object as a prop.
  - [ ] Use `react-markdown` (add to `package.json`) to render the `bulletin_vi` text safely.
  - [ ] Render the `sources_json` array as a numbered list below the text.

- [ ] **T2: Shared Market Data Widget** (AC: 4)
  - [ ] Create `src/components/features/market/MarketSummaryWidget.tsx`.
  - [ ] Fetch data from `/api/market-data?commodity=Gạo` and `/api/market-data/fx?pair=USD/VND`.
  - [ ] Use `<MetricCard>` and `<SourceBox>` (from Epic 7) for FX rate and primary export price.

- [ ] **T3: Backend Use Case** (AC: 1)
  - [ ] Add `getLatestBulletin(commodity: string): Promise<Bulletin | null>` to `IBulletinRepository`.
  - [ ] Implement in `PrismaBulletinRepository`.
  - [ ] Create `src/application/useCases/GetLatestBulletinUseCase.ts`.

- [ ] **T4: Role Pages Assembly** (AC: 1, 5)
  - [ ] Create `src/app/manager/bulletin/page.tsx`.
  - [ ] Create `src/app/officer/bulletin/page.tsx`.
  - [ ] Create `src/app/farmer/bulletin/page.tsx`.
  - [ ] Each page is a Server Component that executes `GetLatestBulletinUseCase` and passes data to `<BulletinView>`.
  - [ ] Place the `<MarketSummaryWidget>` alongside the bulletin text.

- [ ] **T5: Validate & Commit**
  - [ ] Ensure `npx tsc --noEmit` passes.
  - [ ] Ensure the component respects the 17px font override for Farmers (handled automatically if the global CSS rule from Story 1.2 is working).
  - [ ] Commit: `feat(market): implement daily bulletin view and market widgets`

## Dev Notes

### Architecture Constraints

- **Shared Feature Components:** Place feature-specific UI components in `src/components/features/{feature-name}/` if they are shared across multiple roles (Manager, Officer, Farmer). This prevents duplicating the complex Markdown rendering logic three times.
- **Markdown Rendering:** `react-markdown` is lightweight. Avoid heavy Markdown-to-JSX compilers if possible. Ensure standard styling is applied to the output (headings, lists, bold text).

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_None yet_

### Completion Notes List

_To be filled after implementation_

### File List

**Files to CREATE:**
- `apps/web/src/domain/repositories/IBulletinRepository.ts`
- `apps/web/src/infrastructure/db/repositories/PrismaBulletinRepository.ts`
- `apps/web/src/application/useCases/GetLatestBulletinUseCase.ts`
- `apps/web/src/components/features/bulletin/BulletinView.tsx`
- `apps/web/src/components/features/bulletin/BulletinView.module.css`
- `apps/web/src/components/features/market/MarketSummaryWidget.tsx`
- `apps/web/src/components/features/market/MarketSummaryWidget.module.css`
- `apps/web/src/app/manager/bulletin/page.tsx`
- `apps/web/src/app/officer/bulletin/page.tsx`
- `apps/web/src/app/farmer/bulletin/page.tsx`

**Files to UPDATE:**
- `apps/web/package.json` (Add `react-markdown`)
