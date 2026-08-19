# Story 0.3: Production Deviation & Hardening Baseline

Status: ready-for-dev
Epic: 0 — E2E Contract and Delivery Control
Phase: hardening

## Story

As the delivery team, we want known production deviations tracked and resolved by impact, so that the final sprint status distinguishes genuine blockers from deliberate interim implementations.

## Acceptance Criteria

1. A deviation register covers inline styles in bulletin/farm-zone/partner-map, broken or missing sidebar routes, NotificationBell TODO TTS, polling versus SSE, response-shape mismatches, middleware route-group coverage, schema/API drift, and missing loading/empty/error/offline states.
2. Each deviation is classified as blocker, targeted fix story, accepted temporary deviation, or deferred post-MVP work, with owner and dependency.
3. New production feature code has no inline styles; existing inline styles either move to the approved styling system or are linked to a targeted cleanup story with a documented reason.
4. Notification transport behavior is explicit: polling is labelled interim fallback, SSE is the target contract, reconnect/fallback behavior is tested, and removal of polling is not done before SSE parity exists.
5. Notification TTS uses the existing `/api/tts` contract; a TODO or placeholder is not marked complete. Graceful Piper-unavailable behavior is verified.
6. Broken navigation links and unauthorized route access are covered by route smoke tests.
7. The register is linked from `sprint-status.yaml` and does not silently alter n8n workflows or external-provider ownership.

## Dependencies

- Depends on: 0.1 and 0.2.
- Blocks: final hardening sign-off.

## Test Plan

- Static scan for unapproved inline styles and TODO placeholders in production feature paths.
- Playwright route smoke for every role navigation item and unauthorized access.
- Notification integration tests for SSE connect/reconnect, polling fallback, mark-read, TTS and unavailable services.
- Loading, empty, error, retry and offline state checks for all production feature pages.
