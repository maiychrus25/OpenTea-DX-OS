# TEA Test Plan — Story 0.3: Production Deviation & Hardening Baseline

**Risk:** P0 — security, reliability and regression

## Coverage

- `0.3-HARDEN-001`: no unapproved `style={{}}` in new production feature files; existing exceptions are linked to a cleanup key.
- `0.3-HARDEN-002`: every role navigation link resolves to a page or an explicitly tracked deferred story.
- `0.3-HARDEN-003`: NotificationBell TTS uses `/api/tts`, handles play/stop/unavailable, and has no TODO placeholder.
- `0.3-HARDEN-004`: SSE reconnects and falls back to polling with visible non-realtime semantics when the stream is unavailable.
- `0.3-HARDEN-005`: loading, empty, error/retry, unauthorized and offline states exist for each production feature route.
- `0.3-HARDEN-006`: middleware protects all canonical role prefixes without route-group bypass.

## Gate

A deviation may remain only when its accepted exception or follow-up story is recorded in `sprint-status.yaml` and the behavior is covered by a test.
