# Production Deviation Register

This register tracks known deviations from the expected target state in production (MVP).
All items must have a clear owner, justification, and either an accepted exception or a targeted fix story.

| ID | Category | Description | Status | Owner | Dependency/Target Fix |
|---|---|---|---|---|---|
| DEV-001 | Styling | Inline styles (`style={{...}}`) present in some components (e.g., `PartnerMap`, `DocumentView`). | Deferred | FE Team | Post-MVP Cleanup Story |
| DEV-002 | UX/UI | NotificationBell TTS `/api/tts` placeholder used. | Fixed | FE Team | Story 0.3 |
| DEV-003 | Transport | NotificationBell relies on polling (fallback) instead of SSE for realtime updates. | Accepted Interim | Platform Team | Pending SSE Infrastructure |
| DEV-004 | Security | Route-group bypass in middleware exposed canonical pages at root (e.g. `(manager)/farm-zone` as `/farm-zone`). | Fixed | Arch Team | Story 0.3 |
| DEV-005 | Error State | `public invalid-lot 200/loading` deviation from Story 0-2 (200 OK returned during loading instead of proper boundary). | Tracked | FE Team | Hardening 0-3 Tests |
| DEV-006 | UX/UI | Broken or missing sidebar routes in navigation menus. | Deferred | FE Team | Post-MVP Cleanup Story |

## Detailed Notes

### SSE vs Polling
Currently, the notification system uses polling `useSWR(..., { refreshInterval: 60000 })` as an interim fallback.
We have accepted this for MVP to avoid deploying a separate Redis/SSE broadcaster right now, but SSE remains the target contract. 
**Do not remove polling until SSE parity is fully established.**

### Inline Styles
`style={{}}` usage is restricted. Existing violations are documented and deferred to a dedicated post-MVP styling cleanup epic unless they were trivial to fix during 0-3.

### Public invalid-lot 200/loading deviation
Tracked from story 0-2. A public query for an invalid lot might render a 200 OK with a loading state instead of an immediate 404/error boundary. This is being tracked for regression testing in 0-3.
