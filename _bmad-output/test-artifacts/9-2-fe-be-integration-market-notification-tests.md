# TEA Test Plan — Story 9.2: FE–BE Integration Market & Notifications

**Risk:** P0 — role isolation, AI invariant, event delivery

## E2E Scenarios

- `9.2-E2E-001`: n8n-produced bulletin loads in Manager/Officer pages with citations, source count, AI note and raw fallback.
- `9.2-E2E-002`: Manager market chat and Officer technical chat use separate role-scoped history and reject out-of-scope prompts.
- `9.2-E2E-003`: AI output never exposes recommendations or treatment instructions and always includes source metadata.
- `9.2-E2E-004`: notification list, full page, Farmer combined tabs, mark-read and deep links use the same response contract.
- `9.2-E2E-005`: SSE updates unread count, reconnects, and uses an explicitly labelled polling fallback when unavailable.
- `9.2-E2E-006`: TTS button calls `/api/tts`, stops concurrent playback and hides/degrades when Piper is unavailable.
- `9.2-SEC-001`: Farmer cannot read Manager/Officer chat history or another user's notifications.
- `9.2-N8N-001`: n8n notification/bulletin writes are rendered once and are not duplicated by FE integration.

## Quality Gate

Provider and n8n behavior is verified through contract/integration fixtures; browser tests must not call external providers directly.
