# TEA Test Plan — Story 1.5d: Unauthorized Page

**Risk:** P0 — authorization UX and route safety

- `1.5d-UNIT-001`: page renders 403/forbidden heading and Vietnamese explanation.
- `1.5d-UNIT-002`: recovery link points to the current role dashboard without inline styles.
- `1.5d-E2E-001`: wrong-role navigation redirects to `/unauthorized` before protected content renders.
- `1.5d-E2E-002`: keyboard users can focus and activate the recovery link.

Definition of done: role mismatch, direct URL and keyboard recovery paths pass.
