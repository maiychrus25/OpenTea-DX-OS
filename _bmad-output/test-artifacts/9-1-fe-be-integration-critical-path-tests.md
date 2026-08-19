# TEA Test Plan — Story 9.1: FE–BE Integration Critical Path

**Risk:** P0 — data integrity, authorization, irreversible QR export

## E2E Scenarios

- `9.1-E2E-001`: Officer creates household and parcel; polygon/area/crop/cycle persist and reload.
- `9.1-E2E-002`: Farmer sees only own parcels, submits a journal, withdraws a pending entry, and cannot read another household.
- `9.1-E2E-003`: Weather attaches from n8n cache through the server API; cache miss behavior is explicit and does not call external APIs from browser.
- `9.1-E2E-004`: Officer approves harvest only when withdrawal passes; Manager receives the expected notification.
- `9.1-E2E-005`: Officer creates/resumes draft lot, selects eligible parcels, attaches certificate, enters weight/spec and exports QR.
- `9.1-E2E-006`: QR export creates an immutable snapshot, locks the lot, and public page renders without auth.
- `9.1-SEC-001`: Manager cannot mutate Officer farm/journal/lot resources; Farmer cannot cross household boundaries.
- `9.1-API-001`: all responses and errors match the canonical envelope.
- `9.1-DATA-001`: duplicate export/retry does not mutate snapshot or create duplicate lot-parcel links.

## Quality Gate

Run against an integration database with migrations applied; mocks may isolate external services but not Prisma transaction and authorization behavior.
