# Story 10.1: Platform BE Contract Completion

Status: ready-for-dev
Epic: 10 — Platform BE, Schema & Integration Contracts
Phase: domain BE

## Story

As the frontend and workflow subsystems, we need complete typed server contracts for auth/profile/members/households/parcels/journals/partners/search/documents, so that every production screen has one authorized persistence path.

## Acceptance Criteria

1. Missing canonical API routes exist for the documented resource operations, with Zod validation and structured envelopes.
2. Use cases and domain ports enforce Manager/Officer/Farmer permissions and Farmer household isolation; route handlers contain no business logic.
3. Journal supports draft/submit/withdraw/reject/request-changes/batch approval and server weather attachment using the agreed Officer authority.
4. Farm APIs support household/parcel CRUD, polygon/centroid validation, crop cycles, status derivation and harvest approval.
5. Profile/member/invitation, partner, document metadata/presign and global-search contracts exist with explicit ownership.
6. Prisma schema and migrations are safe, non-destructive and match all API fields; migration/backfill evidence is required before dependent stories unblock.
7. Existing n8n-owned tables/data are consumed without moving external ingestion into Next.js.

Dependencies: 0.1, 0.2, 1.3/1.4/1.5, 2.0a/2.1/2.3a, 3.1–3.5a, 6.1.
