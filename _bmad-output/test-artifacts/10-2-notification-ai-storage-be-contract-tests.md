# TEA Test Plan — Story 10.2: Notification, AI, Storage & Public Snapshot BE Contract

**Risk:** P0 — AI invariant, privacy, asynchronous delivery and immutable data

- `10.2-API-001`: notification/list/read/SSE/TTS/chat/diagnosis/storage routes match contract.
- `10.2-SEC-001`: personal, household, role and public snapshot isolation.
- `10.2-AI-001`: no treatment/recommendation output; citations required where applicable.
- `10.2-N8N-001`: n8n-created bulletin/notification rows are consumed once without duplicate writers.
- `10.2-DATA-001`: QR snapshot is immutable after export and retry-safe.
- `10.2-OPS-001`: SSE reconnect/poll fallback and Piper/AI unavailable behavior.
- `10.2-E2E-001`: diagnosis submit → notification → officer confirmation → farmer history.
