# TEA Test Plan — Story 2.3a: TTS API Endpoint

**Risk:** P0 — service boundary and accessibility

- `2.3a-UNIT-001`: empty or over-limit text returns structured validation error.
- `2.3a-UNIT-002`: route calls Piper adapter, never the browser or external provider directly.
- `2.3a-UNIT-003`: Piper timeout/unavailable returns the canonical 503 error without hanging.
- `2.3a-INT-001`: successful response matches the documented audio stream/data envelope and content type.
- `2.3a-SEC-001`: authenticated role matrix allows only approved Manager/Officer/Farmer TTS use.
- `2.3a-OPS-001`: concurrent requests and cancellation do not leak or corrupt audio state.
