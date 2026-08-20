# TEA Test Plan — Story 0.1: Contract, Schema & Route Reconciliation

**Risk:** P0 — contract/security/data integrity

## Coverage

- `0.1-CONTRACT-001`: every story dependency key resolves to an implementation artifact.
- `0.1-CONTRACT-002`: every non-done implementation story has a matching test artifact.
- `0.1-CONTRACT-003`: canonical route/role matrix rejects Manager mutation on Officer-only farm/journal actions and rejects Farmer cross-household access.
- `0.1-CONTRACT-004`: API success/error envelope matches `{data,meta?}` / `{error:{code,message,details?}}`.
- `0.1-SCHEMA-001`: Prisma generate and migration validation cover lot snapshot, notification, bulletin, crop-cycle and certificate fields.
- `0.1-ROUTE-001`: public `/lot/[lot_code]` is accessible without auth; protected role routes redirect/403 on mismatch.

## Implemented test evidence

- Jest contract inventory: `apps/web/src/__tests__/contracts/story-0-1-contract.test.ts`
- Canonical role/route/envelope definitions: `apps/web/src/lib/contracts/story-0-1-contract.ts`
- Browser smoke: `apps/web/tests/e2e/story-0-1-route-smoke.spec.ts`
- Schema validation: `cd apps/web && npm run validate:schema`
- Production build: `cd apps/web && npm run build`
- Full static gate: `cd apps/web && npm run check`

Latest local evidence (2026-08-20 after middleware hardening): contract Jest 8/8, full Jest 115/115, Prisma validate, lint, TypeScript, and production build pass. The Playwright smoke executes public/protected route checks; the invalid-lot not-found assertion is an expected failure documenting a known 200/loading-shell deviation tracked by 0-3.

The browser smoke uses an unauthenticated browser context and starts the Next app on an isolated `E2E_PORT` (default `3100`), avoiding unrelated services on port 3000. It verifies a seeded public lot with `E2E_PUBLIC_LOT_CODE` (HTTP 200 plus trace marker), an invalid public lot (HTTP 404 without authentication redirect), and protected-route redirect to login. The seeded-lot case is skipped when the fixture variable is absent and must not be reported as executed. PostgreSQL migration replay remains environment-gated and requires an isolated `DATABASE_URL`; connection failures must fail the integration job rather than be treated as a passing skip. The CI job runs this Story 0.1 smoke spec explicitly after installing Chromium.

## Gate

No dependent story may become `ready-for-dev` with an unresolved route, field, role, or status reference. The schema reconciliation test is intentionally failing until the canonical fields are implemented or an explicit replacement story is recorded.
