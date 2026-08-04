# Story 6.4: HTX Capability Profile Page

Status: ready-for-dev

## Story

As a Manager,
I want a public-facing storefront page for the cooperative,
so that potential buyers (B2B) can view our production capacity, certifications, and contact information.

## Dependencies
- **Depends on:** 1.6, 4.3
- **Blocks:** None

## Acceptance Criteria

1. **Given** the public route `/htx` **When** a user navigates to it **Then** they see a landing page showcasing the HTX.
2. **Given** the landing page **When** it loads **Then** it aggregates total active land area, total number of households, and lists recent published lots.
3. **Given** the HTX profile data **When** viewed **Then** it displays the name, address, contact phone, and any public certificates (from the Document Store).
4. **Given** the public nature of the page **When** data is fetched **Then** it must filter out PII (like farmer phone numbers) and only show aggregate or explicitly public data.

## Tasks / Subtasks

- [ ] **T1: Define Use Case**
  - [ ] Create `GetPublicHTXProfileUseCase`.
  - [ ] Aggregate logic: sum parcel areas, count households, fetch top 5 recent `PUBLISHED` lots.

- [ ] **T2: Public Page UI**
  - [ ] Create `src/app/htx/page.tsx` (Server Component).
  - [ ] Build a marketing-style landing page.
  - [ ] Display the statistics prominently.

## Dev Notes

- **Aesthetics:** This is the storefront. The UI must be highly polished (following the `web_application_development` design aesthetics: rich colors, modern typography).

## File List

**Files to CREATE:**
- `apps/web/src/application/useCases/GetPublicHTXProfileUseCase.ts`
- `apps/web/src/app/htx/page.tsx`
- `apps/web/src/app/htx/page.module.css`

**Files to UPDATE:**
- N/A
