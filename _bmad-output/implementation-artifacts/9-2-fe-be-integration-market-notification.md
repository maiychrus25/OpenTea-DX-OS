# Story 9.2: FE–BE Integration — Market, Chat and Notifications

Status: ready-for-dev
Epic: 9 — FE–BE Integration and E2E Completion
Phase: integration

## Story

As a Manager, Officer or Farmer, I want bulletin, chatbot and notification UI to consume the production data and event contracts, so that cited information and operational updates remain consistent across roles and n8n outputs.

## Acceptance Criteria

1. Manager and Officer bulletin pages read the latest n8n-produced bulletin data, preserve three-card/category presentation, citations, source count, AI note and raw-data fallback; Farmer receives only the agreed bulletin surface.
2. Market and technical chat routes use distinct role-scoped contracts, persist seven-day history, stream or explicitly show unavailable state, and never emit uncited recommendations or treatment instructions.
3. Notification list, bell, full-page/combined views, mark-read, deep links, filters and unread count use one notification response shape and role/data isolation.
4. SSE is implemented according to the documented stream contract with reconnect and an explicitly tested polling fallback until parity is proven; the UI does not claim polling is realtime SSE.
5. Notification TTS calls `/api/tts`, supports playing/stopping/error/unavailable states, and uses the existing Piper adapter without direct browser-to-Piper calls.
6. Broadcast and technical announcements create the correct recipients and are visible in the bell/inbox; n8n Mattermost remains an independent channel and is not replaced by browser code.
7. Existing n8n bulletin/notification outputs are consumed without adding duplicate ingestion or notification writers in the Next.js pages.

## Dependencies

- Depends on: 0.1, 0.2, 0.3, 2.1–2.7, 3.7, 5.6–5.8, 6.3, 8.1/8.6/8.9.
- Blocks: cross-role notification and market E2E sign-off.

## Test Plan

- Contract tests for bulletin, chat, notifications, TTS and SSE envelopes.
- Playwright tests for manager/officer/farmer role surfaces, citations, streaming/unavailable states, mark-read, deep links and combined Farmer tabs.
- n8n integration fixtures verify bulletin/notification records are rendered without duplicate writes.
- Security tests verify farmers cannot read manager/officer chat or another user's notifications.
