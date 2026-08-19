# Story 8.10: Authentication Recovery & Registration UI

Status: ready-for-dev
Epic: 8 — FE Prototype Reconstruction
Phase: FE prototype

## Story

As a prospective or existing user, I want registration, forgot-PIN, wrong-PIN, locked-account, retry and loading screens, so that authentication is understandable beyond the happy path.

## Acceptance Criteria

1. Registration supports household member details, HTX selection, consent and pending-approval state.
2. Forgot PIN supports identity verification, new PIN validation, success and failure states.
3. Login shows loading, invalid phone, wrong PIN, locked account, unavailable provider and retry states in Vietnamese.
4. Unauthorized, pending-account and locked-account views use the shared shell/tokens and role-safe recovery links.
5. Mock-only mode is clearly labelled; no client code pretends to validate credentials or create sessions.
6. All forms have field-level validation, keyboard/focus behavior and 44px touch targets.

Dependencies: 1.5/1.5f, 7.1/7.6, 0.1.
Follow-up: authentication BE/Keycloak integration remains 8.10- BE/9.x work.
