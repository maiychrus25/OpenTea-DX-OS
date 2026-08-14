# Story 5.3: Farmer Disease Diagnosis UI

Status: ready-for-dev

> [!WARNING]
> **DESIGN SYNC - 2026-08-14 (Epic 7):** Use direct routes (officer/..., farmer/...) NOT route groups. CSS tokens: var(--primary), var(--foreground), var(--card), var(--border). Shared components: Pill, Button, MetricCard from @/components/ui (available after story 7-4/7-5). No inline styles.


## Story

As a Farmer,
I want to take a picture of a sick plant and upload it for AI diagnosis,
so that I can quickly identify the problem before waiting for a technical officer.

## Dependencies
- **Depends on:** 4.6 (Disease API).
- **Blocks:** 5.4 (PWA Offline Queue), 5.5 (Officer Review).

## Acceptance Criteria

1. **Given** I am logged in as a Farmer **When** I navigate to `/farmer/diagnosis` **Then** I see a camera interface or file upload button (mobile-first).
2. **Given** a submitted image **When** the Next.js API receives it **Then** it securely forwards the image to the internal FastAPI service (`http://disease-api:8000/predict`).
3. **Given** the FastAPI response **When** it returns the `disease_name` **Then** Next.js creates a `DiseaseReport` record in the DB (status: `PENDING`) and returns the AI result to the UI.
4. **Given** the UI **When** it receives the result **Then** it displays the disease name and advises me to wait for an Officer to provide treatment instructions.

## Hexagonal Architecture Design & Tasks

### 1. Domain Layer (`src/domain/`)
- [ ] **T1.1: Schema & Entity**
  - File: `src/domain/schemas/diseaseReportSchema.ts` (household_id, image_url, ai_predicted_disease, confidence_score, status, treatment_recommendation).
- [ ] **T1.2: Repository Port**
  - File: `src/domain/ports/IDiseaseReportRepository.ts`

### 2. Infrastructure Layer (`src/infrastructure/`)
- [ ] **T2.1: FastAPI Proxy Adapter**
  - File: `src/infrastructure/external/DiseaseAiAdapter.ts`
  - Implement `IModelPort`. Use `fetch` to POST `FormData` to `http://disease-api:8000/predict`.

### 3. Application Layer (`src/application/`)
- [ ] **T3.1: Use Case**
  - File: `src/application/useCases/disease/DiagnoseDiseaseUseCase.ts`
  - Logic: Receives image Blob. Uploads to MinIO (via Storage Port from Story 6.1, if implemented early) or saves locally for MVP. Sends image to AI Adapter. Creates DB record. Returns result.

### 4. API & UI Layer
- [ ] **T4.1: API Proxy Route**
  - File: `src/app/api/diagnosis/route.ts` (POST)
- [ ] **T4.2: Client Camera UI**
  - File: `src/app/(farmer)/diagnosis/_components/DiagnosisClient.tsx`
  - Use `<input type="file" accept="image/*" capture="environment" />` to trigger mobile rear camera.
