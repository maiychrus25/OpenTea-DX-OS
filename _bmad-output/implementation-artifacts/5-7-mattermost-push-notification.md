# Story 5.7: Mattermost Push Notification

Status: ready-for-dev

## Dependencies
- **Depends on:** 4.3 (Publish Lot), 5.3 (Disease Diagnosis).

## Hexagonal Architecture Design & Tasks
### 1. Domain & Infra Layer
- [ ] File: `src/domain/ports/IAlertPort.ts`
- [ ] File: `src/infrastructure/notifications/MattermostAdapter.ts` (Uses `fetch` to POST webhook).

### 2. App Layer
- [ ] Inject `IAlertPort` into `DiagnoseDiseaseUseCase` and `PublishLotUseCase`. Catch and ignore fetch errors to ensure core transactions don't fail.
