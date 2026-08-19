# Story 0.2: n8n Workflow Verification & Data Contract

Status: ready-for-dev
Epic: 0 — E2E Contract and Delivery Control
Phase: n8n/infrastructure

## Story

As the delivery team, we want the existing n8n workflows audited and represented as explicit producers, so that FE/BE stories consume their outputs without moving ingestion logic into Next.js or duplicating workflows.

## Acceptance Criteria

1. Every workflow under `workflows/` is catalogued with trigger, external source, credential boundary, output table, writer ownership, downstream consumer, and current verification evidence.
2. Market, weather, FX, and bulletin workflows remain n8n-owned; browser and Next.js feature code do not call external providers directly.
3. Each ingestion workflow documents idempotency key/upsert behavior, retry/error path, and notification behavior. Any mismatch with Prisma table names, enum casing, required recipient fields, or unique constraints is recorded as a blocking follow-up.
4. Bulletin synthesis documents model/provider, source context, crop filtering, citation invariant, no-recommendation invariant, previous-latest handling, and output fields consumed by `/api/bulletin`.
5. Officer reminder and Mattermost workflows document recipient resolution, duplicate-delivery prevention, status transitions, and whether the behavior is MVP or deferred.
6. Existing workflows are not replaced or renamed solely to match a story filename. Story references are updated to actual committed workflow names, with aliases only when needed for migration.
7. Workflow verification produces fixture execution or database evidence for successful output, rerun/idempotency, and Error Trigger behavior.

## Dependencies

- Depends on: 0.1 contract/schema reconciliation; workflow inventory.
- Blocks: market/bulletin/weather/FX/notification integration stories.

## Test Plan

- JSON parse and required-node checks for every workflow.
- Database integration tests for upsert/idempotency and error-log shape.
- Controlled workflow execution tests for one success and one failure path per workflow family.
- Credential scan ensures secrets are not embedded in exported JSON.
