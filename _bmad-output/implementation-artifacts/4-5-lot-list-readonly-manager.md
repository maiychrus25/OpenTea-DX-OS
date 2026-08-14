# Story 4.5: Lot List Readonly Manager

Status: ready-for-dev

> [!WARNING]
> **DESIGN SYNC - 2026-08-14 (Epic 7):** Use direct routes (officer/..., farmer/...) NOT route groups. CSS tokens: var(--primary), var(--foreground), var(--card), var(--border). Shared components: Pill, Button, MetricCard from @/components/ui (available after story 7-4/7-5). No inline styles.


## Story

As a Manager,
I want to view the list of all published lots in the system,
so that I can oversee production output without accidentally altering the data.

## Dependencies
- **Depends on:** 4.3 (Lots must exist).

## Acceptance Criteria

1. **Given** I am logged in as a Manager **When** I navigate to `/manager/lots` **Then** I see a list of `PUBLISHED` lots.
2. **Given** the list **When** I view it **Then** I see NO buttons to Edit, Create, or Delete lots.

## Hexagonal Architecture Design & Tasks

### 1. Application Layer (`src/application/`)
- [ ] **T1.1: Use Case**
  - File: `src/application/useCases/lot/GetAllLotsUseCase.ts`

### 2. Frontend UI Layer (`src/app/(manager)/`)
- [ ] **T2.1: Readonly Table**
  - File: `src/app/(manager)/lots/page.tsx`
  - Re-use the table component from Officer, but omit action columns.
