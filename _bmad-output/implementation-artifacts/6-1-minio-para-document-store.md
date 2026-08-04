# Story 6.1: MinIO PARA Document Store

Status: ready-for-dev

## Dependencies
- **Depends on:** None.
- **Blocks:** 6.2 (Lot Certs), 6.3 (Chatbot).

## Hexagonal Architecture Design & Tasks
### 1. Infra Layer
- [ ] File: `src/infrastructure/storage/MinioAdapter.ts` (Implement `IStoragePort`).

### 2. API & UI Layer
- [ ] File: `src/app/api/documents/upload-url/route.ts` (Return pre-signed PUT URL).
- [ ] File: `src/app/(officer)/documents/page.tsx` (File explorer UI).
