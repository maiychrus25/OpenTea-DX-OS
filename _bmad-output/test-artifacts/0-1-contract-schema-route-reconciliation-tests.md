# TEA Test Plan — Story 0.1: Contract, Schema & Route Reconciliation

**Risk:** P0 — contract/security/data integrity

## Coverage

- `0.1-CONTRACT-001`: every story dependency key resolves to an implementation artifact.
- `0.1-CONTRACT-002`: every non-done implementation story has a matching test artifact.
- `0.1-CONTRACT-003`: canonical route/role matrix rejects Manager mutation on Officer-only farm/journal actions and rejects Farmer cross-household access.
- `0.1-CONTRACT-004`: API success/error envelope matches `{data,meta?}` / `{error:{code,message,details?}}`.
- `0.1-SCHEMA-001`: Prisma generate and migration validation cover lot snapshot, notification, bulletin, crop-cycle and certificate fields.
- `0.1-ROUTE-001`: public `/lot/[lot_code]` is accessible without auth; protected role routes redirect/403 on mismatch.

## Gate

No dependent story may become `ready-for-dev` with an unresolved route, field, role, or status reference.
