# TEA Test Plan — Story 1.5f: Keycloak Realm Configuration

**Risk:** P0 — authentication and role security

- `1.5f-CONFIG-001`: realm import is valid and contains manager/officer/farmer roles.
- `1.5f-CONFIG-002`: WebAuthn/passkey and PIN fallback settings match the approved realm contract.
- `1.5f-INT-001`: OIDC login creates a session with a typed recognized role.
- `1.5f-SEC-001`: missing/unrecognized role cannot access any protected role route.
- `1.5f-E2E-001`: each seeded role reaches only its canonical dashboard after login.
- `1.5f-OPS-001`: secrets are supplied through environment/configuration and are not committed in realm JSON.

Definition of done: realm import, login, role extraction and invalid-role denial are verified in a disposable Keycloak environment.
