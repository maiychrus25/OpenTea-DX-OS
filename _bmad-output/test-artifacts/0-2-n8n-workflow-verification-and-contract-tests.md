# TEA Test Plan — Story 0.2: n8n Workflow Verification & Data Contract

**Risk:** P0 — ingestion integrity and operational reliability

## Coverage

- `0.2-N8N-001`: every workflow JSON parses and has a trigger, intended writer, and Error Trigger/error path.
- `0.2-N8N-002`: market/weather/FX/bulletin reruns are idempotent for their declared conflict key.
- `0.2-N8N-003`: workflow output columns and enum values match the canonical Prisma/API contract.
- `0.2-N8N-004`: bulletin synthesis filters the agreed crop data and preserves source citations/no-recommendation invariant.
- `0.2-N8N-005`: officer reminder resolves valid recipients and does not create duplicate reminders on a repeated run.
- `0.2-N8N-006`: Mattermost failure leaves a retryable record and successful delivery marks it exactly once.
- `0.2-N8N-007`: exported workflows contain no secrets or hardcoded private credentials.

## Gate

A workflow is not marked verified until output rows and failure behavior are observed against the real schema or an equivalent integration database fixture.
