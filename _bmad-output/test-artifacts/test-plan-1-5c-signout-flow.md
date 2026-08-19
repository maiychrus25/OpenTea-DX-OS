# TEA Test Plan — Story 1.5c: Sign-Out Flow

**Risk:** P0 — session security

- `1.5c-UNIT-001`: user menu exposes sign out and closes on outside click/Escape.
- `1.5c-INT-001`: sign-out action calls the server-side session termination path, not a GET-only navigation.
- `1.5c-E2E-001`: authenticated user signs out and lands on `/login`.
- `1.5c-E2E-002`: back navigation after sign-out cannot reopen protected content.
- `1.5c-SEC-001`: session cookie/token is invalidated and protected API calls return unauthorized.

Definition of done: session invalidation and redirect are verified in browser and API tests.
