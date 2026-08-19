# TEA Test Plan — Story 1.2a: Global Error, Loading & Not Found

**Risk:** P1 — recovery and regression UX

- `1.2a-UNIT-001`: error boundary renders Vietnamese error heading and retry control.
- `1.2a-UNIT-002`: retry invokes the supplied reset callback exactly once.
- `1.2a-UNIT-003`: loading skeleton has `aria-busy` and no spinner-only page.
- `1.2a-E2E-001`: unknown route renders not-found page with dashboard recovery link.
- `1.2a-E2E-002`: delayed data route renders skeleton before content.
- `1.2a-E2E-003`: API failure renders inline retry state without losing shell/navigation.

Definition of done: unit, route smoke and accessibility assertions pass.
