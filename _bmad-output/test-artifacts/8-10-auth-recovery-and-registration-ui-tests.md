# TEA Test Plan — Story 8.10: Authentication Recovery & Registration UI

**Risk:** P0 — authentication recovery and account safety

- `8.10-UNIT-001`: phone/PIN validation and field errors.
- `8.10-UNIT-002`: loading, provider error, lock and retry states.
- `8.10-UNIT-003`: registration consent and pending approval state.
- `8.10-E2E-001`: forgot PIN success/failure flow.
- `8.10-SEC-001`: mock UI never creates a session or accepts arbitrary PIN as authenticated.
