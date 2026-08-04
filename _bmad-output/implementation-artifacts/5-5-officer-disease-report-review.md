# Story 5.5: Officer Disease Report Review

Status: ready-for-dev

## Story

As a Technical Officer,
I want to review the pending disease reports submitted by farmers (and analyzed by AI),
so that I can provide them with specific treatment recommendations and officially approve the diagnosis.

## Dependencies
- **Depends on:** 5.3 (Disease Reports exist).
- **Blocks:** None.

## Acceptance Criteria

1. **Given** I am logged in as an Officer **When** I navigate to `/officer/diseases` **Then** I see a list of `PENDING` disease reports.
2. **Given** the list **When** I click on a report **Then** I see the photo, AI `disease_name` and `confidence_score`.
3. **Given** the detail view **When** I fill in "Hướng dẫn điều trị" and click "Duyệt" **Then** the report status changes to `APPROVED`.
4. **Given** the AI Invariant **When** implementing this **Then** the UI must force the Human Officer to type the treatment.

## Hexagonal Architecture Design & Tasks

### 1. Application Layer (`src/application/`)
- [ ] **T1.1: Use Case**
  - File: `src/application/useCases/disease/ReviewDiseaseReportUseCase.ts`
  - Logic: Validate input. Update DB `status = APPROVED`, `treatment_recommendation = input.treatment`. Create `Notification` for Farmer.

### 2. Frontend UI Layer (`src/app/(officer)/`)
- [ ] **T2.1: Review Page**
  - File: `src/app/(officer)/diseases/[id]/page.tsx`
  - Fetch report by ID. Render Image. Form for text input. PUT to API.
