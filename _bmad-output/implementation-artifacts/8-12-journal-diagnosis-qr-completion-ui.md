# Story 8.12: Journal, Diagnosis & QR Completion States

Status: ready-for-dev
Epic: 8 — FE Prototype Reconstruction
Phase: FE prototype

## Story

As an Officer or Farmer, I want the missing edge states around journal review, disease diagnosis and QR traceability, so that field workflows are usable beyond the happy-path mock screens.

## Acceptance Criteria

1. Journal supports entry detail, draft edit/delete, reject with reason, request changes, approval history and clear status transitions.
2. Pesticide activity shows product, dosage, performer, withdrawal days and violation warning; no-pesticide path is explicit.
3. Diagnosis supports real file-selection presentation, multiple candidate results, low-confidence warning, history and send-to-officer confirmation without treatment recommendations.
4. QR UI supports export confirmation, print/download/label quantity, camera scan and invalid/expired/revoked/not-found states.
5. All irreversible/destructive actions require confirmation; loading/error/empty/offline/retry states are present.
6. This story is FE-only; API, storage, model and QR immutability remain integration work.

Dependencies: 4.1–4.6a, 5.2–5.5, 8.4/8.7.
