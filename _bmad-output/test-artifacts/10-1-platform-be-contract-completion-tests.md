# TEA Test Plan — Story 10.1: Platform BE Contract Completion

**Risk:** P0 — authorization, schema integrity and shared API contract

- `10.1-API-001`: all canonical resource routes validate input and return structured envelopes.
- `10.1-SEC-001`: role matrix and Farmer household isolation.
- `10.1-DATA-001`: farm/journal writes use transactions and preserve crop-cycle/status invariants.
- `10.1-SCHEMA-001`: migrations apply without destructive drops and Prisma types match handlers.
- `10.1-INT-001`: weather/bulletin/partner/farm consumers use the correct adapters and n8n-owned data.
- `10.1-E2E-001`: setup → journal → approval contract with real integration database.
