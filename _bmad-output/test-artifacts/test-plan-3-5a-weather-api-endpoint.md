# TEA Test Plan — Story 3.5a: Weather API Endpoint

**Risk:** P0 — data isolation and n8n ownership

- `3.5a-UNIT-001`: invalid date/parcel query returns structured validation error.
- `3.5a-SEC-001`: Farmer cannot request weather for another household's parcel.
- `3.5a-INT-001`: cache hit returns nearest valid n8n-owned record without external call.
- `3.5a-INT-002`: backdated cache miss follows the approved server-side fallback contract and persists safely if allowed.
- `3.5a-INT-003`: future/no-data path returns explicit empty data while preserving editable UI state.
- `3.5a-PERF-001`: cache hit meets the agreed latency target and does not issue duplicate provider requests.
