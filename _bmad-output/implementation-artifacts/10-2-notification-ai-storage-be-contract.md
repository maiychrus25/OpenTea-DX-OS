# Story 10.2: Notification, AI, Storage & Public Snapshot BE Contract

Status: ready-for-dev
Epic: 10 — Platform BE, Schema & Integration Contracts
Phase: domain BE

## Story

As the UI and n8n consumers, we need stable contracts for notifications, AI, MinIO and public QR data, so that asynchronous features remain secure and consistent.

## Acceptance Criteria

1. Notification GET/read/mark-all/delete/filter/preferences and SSE routes use the canonical envelope, recipient/broadcast rules, deep links and unread count.
2. Notification repository returns personal plus explicitly targeted broadcasts; disease/journal/harvest fan-out creates valid recipients.
3. TTS route/adapter supports text validation, stream/playback status and Piper-unavailable behavior; no client direct call.
4. Market/technical chatbot routes support role-specific scope, streaming/history retention, citation metadata and AI invariant enforcement.
5. Diagnosis proxy persists report/photo metadata, isolates farmer history, supports officer confirmation and never returns treatment recommendations.
6. MinIO presigned upload/download and certificate/document metadata enforce allowed prefixes and object ownership.
7. Lot export builds an immutable public snapshot transactionally, generates QR asset/link, locks status, and public page exposes only approved snapshot data.
8. Contract tests cover n8n-produced bulletin/notification records and do not introduce a duplicate writer.

Dependencies: 0.1/0.2, 2.3a/2.4/2.5/2.7, 4.6a, 5.5–5.8, 6.1–6.3, 9.1/9.2.
