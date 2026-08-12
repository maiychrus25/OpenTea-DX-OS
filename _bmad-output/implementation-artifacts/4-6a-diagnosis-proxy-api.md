# Story 4.6a: Disease Diagnosis API Proxy Route

Status: ready-for-dev

## Story

As a developer (enabling disease diagnosis for farmers in Story 5.3),
I want a `POST /api/diagnosis` route that validates, proxies to FastAPI disease-api, creates records, and returns results,
so that farmers never contact the internal service directly and AI Invariants are enforced (AD-8).

## Acceptance Criteria

1. **Given** Farmer calls `POST /api/diagnosis` with multipart image + `parcelId` → validates (farmer role required), proxies to `http://disease-api:8000/predict`, creates `DiseaseReport` record, uploads photo to MinIO, creates Officer Notification, returns `{ data: { disease_name, confidence_score, report_id } }`
2. Non-farmer role → HTTP 403
3. disease-api unavailable → HTTP 503 `{ error: { code: 'SERVICE_UNAVAILABLE', message: 'Dịch vụ chẩn đoán bệnh tạm ngưng. Vui lòng thử lại sau.' } }`
4. Response MUST NOT contain `treatment` or `recommendation` fields (AI Invariant from AGENTS.md)
5. Photo uploaded to MinIO with pre-signed URL (valid 15 min) stored in `DiseaseReport.photo_url`
6. Officer notification created with type='disease_report'

## Tasks / Subtasks

- [ ] Create `apps/web/src/app/api/diagnosis/route.ts` (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Parse multipart form: `image` file + `parcelId` string
  - [ ] Auth check: session.user.role === 'farmer' or 403
  - [ ] Zod validate parcelId (uuid)
  - [ ] Instantiate `DiseaseApiAdapter`, `MinioStorageAdapter`, `SubmitDiagnosisUseCase`
  - [ ] Execute use case → return result (NEVER add treatment/recommendation)
- [ ] Create `apps/web/src/lib/validations/diagnosis.schema.ts` (AC: 1)
  - [ ] `{ parcelId: z.string().uuid() }` (image validated by content-type check)
- [ ] Create `apps/web/src/domain/disease/ports/DiseaseDetectionPort.ts` (AC: 4)
  - [ ] `interface DiseaseDetectionPort { predict(imageBuffer): Promise<{ disease_name: string; confidence_score: number }> }`
  - [ ] **CRITICAL**: Return type has NO treatment or recommendation fields
- [ ] Create `apps/web/src/domain/disease/ports/StoragePort.ts` (AC: 5)
  - [ ] `interface StoragePort { upload(buffer, key, mimeType): Promise<string> }` (returns pre-signed URL)
- [ ] Create `apps/web/src/application/disease/SubmitDiagnosisUseCase.ts` (AC: 1, 4, 5, 6)
  - [ ] Orchestrate: upload photo → call disease-api → create DiseaseReport → create Notification
  - [ ] Return `{ disease_name, confidence_score, report_id }`
- [ ] Create `apps/web/src/infrastructure/disease-api/DiseaseApiAdapter.ts` (AC: 3)
  - [ ] `fetch('http://disease-api:8000/predict', { method: 'POST', body: formData })`
  - [ ] Parse `{ disease_name, confidence_score }` only — ignore any other fields
  - [ ] On error/timeout → throw `ServiceUnavailableError`
- [ ] Create `apps/web/src/infrastructure/storage/MinioStorageAdapter.ts` (AC: 5)
  - [ ] Use MinIO SDK (server-side only — AD-12)
  - [ ] Upload image → generate pre-signed URL (15 min)

## Dev Notes

### AI Invariant (NON-NEGOTIABLE from AGENTS.md)
```
KHÔNG trả về treatment/recommendation — chỉ disease_name + confidence_score
API response từ chatbot/bulletin PHẢI chứa sources array (không được bỏ trống)
```
The port interface, use case, and route handler must ALL enforce this. Do a final check before returning.

### FastAPI Interaction Pattern
```typescript
// DiseaseApiAdapter.predict():
const form = new FormData()
form.append('file', imageBlob, 'diagnosis.jpg')
const response = await fetch('http://disease-api:8000/predict', {
  method: 'POST', body: form,
  signal: AbortSignal.timeout(10000), // 10s timeout
})
if (!response.ok) throw new ServiceUnavailableError()
const { disease_name, confidence_score } = await response.json()
// Return ONLY these two fields:
return { disease_name, confidence_score }
```

### MinIO Client — Server Only
```
MinIO SDK must ONLY be used in infrastructure/storage/ — never in client components (AD-12)
Import: import { Client } from 'minio'
```
Check `.env.example` for MinIO connection vars: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`.

### DiseaseReport Schema (from schema.prisma)
```prisma
model DiseaseReport {
  id                String   @id
  parcel_id         String
  photo_url         String   // pre-signed URL
  ai_result         String   // disease_name
  confidence_score  Float
  detected_by       String   // farmer user ID
  detection_date    DateTime
  confirmed_by      String?
  confirmed_diagnosis String?
  treatment_notes   String?  // Officer-internal ONLY, never returned to farmer
}
```

### References
- [Source: apps/web/prisma/schema.prisma — DiseaseReport model]
- [Source: apps/web/src/infrastructure/db/repositories/PrismaHtxProfileRepository.ts — adapter pattern]
- [Source: docs/rules-and-limits.md §1 — AI Invariants]
- [Source: docker/docker-compose.yml — disease-api and minio service]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

### File List
- `apps/web/src/app/api/diagnosis/route.ts` (NEW)
- `apps/web/src/lib/validations/diagnosis.schema.ts` (NEW)
- `apps/web/src/domain/disease/ports/DiseaseDetectionPort.ts` (NEW)
- `apps/web/src/domain/disease/ports/StoragePort.ts` (NEW)
- `apps/web/src/application/disease/SubmitDiagnosisUseCase.ts` (NEW)
- `apps/web/src/infrastructure/disease-api/DiseaseApiAdapter.ts` (NEW)
- `apps/web/src/infrastructure/storage/MinioStorageAdapter.ts` (NEW)
