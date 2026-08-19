# Story 0.1: E2E Contract, Schema & Route Reconciliation

Status: ready-for-dev
Epic: 0 — E2E Contract and Delivery Control
Phase: contract/schema

## Story

As the delivery team, we want one canonical contract for roles, routes, API envelopes, Prisma models, and workflow-owned data, so that FE prototype work can be connected to BE without duplicate or incompatible implementations.

## Acceptance Criteria

1. A reviewed matrix maps every core flow to canonical route, role, API endpoint, use case/port, adapter/model, n8n workflow (when applicable), and test-plan key.
2. Canonical roles and permissions are explicit: Manager owns market/profile/partners and reads farm/lots; Officer owns farm/journal/harvest/lot/QR/disease review; Farmer is restricted to their household/parcels and own journal/diagnosis/notifications.
3. Canonical URLs are agreed and used by stories: `/manager/chat`, `/officer/chat`, `/officer/journal`, `/officer/lots`, `/manager/lots`, `/farmer/bulletin-notifications`, `/manager/profile`, `/officer/profile`, `/farmer/profile`, `/lot/[lot_code]`.
4. Success responses use `{ data, meta? }`; errors use `{ error: { code, message, details? } }`; Zod validates all request boundaries; role checks execute server-side.
5. Prisma schema and API contract agree on ownership and required fields, including crop-cycle journal linkage, lot harvest/packaging fields, immutable QR public snapshot, bulletin metadata, notification recipient/deep-link fields, and certificate references.
6. The reconciliation records any intentional deviation from BA/PRD/architecture and names the replacement story; no story is marked ready while it depends on an undefined field, route, or status key.
7. The output updates `epics.md`, `sprint-status.yaml`, `docs/api-contract.md` or `docs/database-schema.md` where the canonical contract requires it, without changing n8n ownership.

## Dependencies

- Depends on: BA/PRD/architecture/UX audit; production and workflow inventory.
- Blocks: all new FE-BE integration and schema-dependent stories.

## Test Plan

- Contract tests assert route/role matrix and response envelopes.
- Static checks detect dangling story dependencies and undefined routes/fields.
- Prisma generate/migration validation confirms the agreed schema.
- E2E smoke verifies role mismatch redirects and public QR remains unauthenticated.
