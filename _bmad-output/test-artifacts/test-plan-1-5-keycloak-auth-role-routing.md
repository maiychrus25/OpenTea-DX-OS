# 🧪 Test Plan — Story 1.5: Keycloak Auth, Role Injection & Layout Routing

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 1.5 — Keycloak Auth, Role Injection & Layout Routing
**Date:** 2026-08-05
**Risk Level:** 🔴 HIGH — Authentication and RBAC are security-critical. A failure here could expose sensitive features (like batch approval or user management) to unauthorized roles.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| NextAuth session missing `role` claim | HIGH | HIGH | E2E mock session tests + Unit tests for `jwt`/`session` callbacks |
| Middleware RBAC bypass | LOW | CRITICAL | Extensive matrix testing of all roles against all paths |
| Infinite redirect loop on login/unauthorized | MEDIUM | HIGH | Playwright E2E redirect trace tests |
| Keycloak mapping misconfiguration | HIGH | HIGH | Documented manual integration test step |

---

## Test Strategy for Story 1.5

### Approach

We need to test the auth boundaries at three levels:
1. **Unit (NextAuth Callbacks):** Ensure `role` extraction logic works.
2. **Integration (Middleware):** Ensure the middleware routes correctly based on the mock session.
3. **E2E (Playwright):** Ensure the full login flow + redirection works (mocking Keycloak if needed, but preferably against the real Keycloak container for one critical path).

**Tools:**
- **Unit/Integration:** Jest (mocking NextAuth session)
- **E2E:** Playwright
- **Test files location:** `apps/web/src/__tests__/auth/` and `apps/web/tests/e2e/auth/`

---

## Test Cases

### TC-1.5-01: NextAuth Profile Mapping (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P0

**Test Concept:**
Directly invoke the `profile` mapping function defined in `auth.config.ts` with mock Keycloak profiles to ensure `role` is correctly determined.

```typescript
// __tests__/auth/profile-mapping.test.ts
import { authConfig } from '@/../auth.config'

describe('Keycloak Profile Mapping', () => {
  const profileCallback = authConfig.providers[0].profile as Function

  it('maps MANAGER role correctly', () => {
    const mockProfile = { sub: '123', realm_access: { roles: ['MANAGER'] } }
    const result = profileCallback(mockProfile)
    expect(result.role).toBe('MANAGER')
  })

  it('defaults to FARMER if no roles present', () => {
    const mockProfile = { sub: '123' }
    const result = profileCallback(mockProfile)
    expect(result.role).toBe('FARMER')
  })
})
```

**Pass Criteria:** Correct role string is returned based on the input profile claims.
**Fail Criteria:** Returns undefined or incorrect role.

---

### TC-1.5-02: NextAuth Callbacks (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P0

**Test Concept:**
Test the `jwt` and `session` callbacks to ensure the role and id propagate from the initial user object down to the final session object.

```typescript
// __tests__/auth/callbacks.test.ts
import { authConfig } from '@/../auth.config'

describe('NextAuth Callbacks', () => {
  it('jwt callback injects role and sub', () => {
    const jwtCallback = authConfig.callbacks?.jwt as Function
    const token = jwtCallback({ token: {}, user: { id: 'user-1', role: 'OFFICER' } })
    expect(token.role).toBe('OFFICER')
    expect(token.sub).toBe('user-1')
  })

  it('session callback exposes role and id', () => {
    const sessionCallback = authConfig.callbacks?.session as Function
    const session = sessionCallback({ session: { user: {} }, token: { sub: 'user-1', role: 'MANAGER' } })
    expect(session.user.role).toBe('MANAGER')
    expect(session.user.id).toBe('user-1')
  })
})
```

**Pass Criteria:** Session object correctly contains `user.role` and `user.id`.
**Fail Criteria:** Missing claims in the final session.

---

### TC-1.5-03: Middleware RBAC Matrix (Integration)

**Type:** Integration
**Tool:** Jest (Mocking `NextAuth` middleware req)
**Priority:** P0

**Test Concept:**
We can test the middleware logic by invoking the default export of `middleware.ts` with mock NextRequest objects.

| Role | Path Accessed | Expected Result |
|---|---|---|
| (None) | `/manager/dashboard` | Redirect to Login |
| MANAGER | `/` | Redirect to `/manager/dashboard` |
| MANAGER | `/officer/dashboard` | Redirect to `/unauthorized` |
| OFFICER | `/` | Redirect to `/officer/dashboard` |
| OFFICER | `/manager/dashboard` | Redirect to `/unauthorized` |
| FARMER | `/` | Redirect to `/farmer/today` |
| FARMER | `/officer/dashboard` | Redirect to `/unauthorized` |
| MANAGER | `/manager/dashboard` | Allow (No Redirect) |

**Pass Criteria:** All matrix conditions pass.
**Fail Criteria:** Unauthorized access allowed, or valid access blocked.

---

### TC-1.5-04: Route Groups Render Correct Layout (E2E)

**Type:** E2E
**Tool:** Playwright
**Priority:** P1

**Test Concept:**
Log in (using a mock provider or real Keycloak) and assert that the `AppShell` renders the correct navigation items for that role.

```typescript
// tests/e2e/auth/role-layout.spec.ts
import { test, expect } from '@playwright/test'

test('MANAGER sees manager navigation', async ({ page }) => {
  // Assume a helper `loginAs` exists that mocks the session or automates Keycloak login
  await loginAs(page, 'MANAGER')
  await page.goto('/manager/dashboard')
  
  // Assert specific nav items exist
  await expect(page.locator('text=Quản Lý Mã Lô')).toBeVisible()
  await expect(page.locator('text=Duyệt Thu Hoạch')).not.toBeVisible() // Officer item
})
```

**Pass Criteria:** Correct role-specific navigation renders.
**Fail Criteria:** Sees another role's navigation items.

---

## Test Execution Plan

```
P0 (blocking):
  TC-1.5-01 → TC-1.5-02 → TC-1.5-03

P1 (important):
  TC-1.5-04
```

---

## Definition of Done for Story 1.5

- [ ] `TC-1.5-01` PASS: Profile mapping extracts role correctly.
- [ ] `TC-1.5-02` PASS: Callbacks propagate role to the final session.
- [ ] `TC-1.5-03` PASS: Middleware strictly enforces the RBAC matrix.
- [ ] `TC-1.5-04` PASS: Route groups render the `AppShell` with the correct nav items.
- [ ] Manual check: Logging in via the real local Keycloak container works.
- [ ] Committed with: `feat(auth): integrate keycloak next-auth and role-based routing`

---

*🧪 Murat notes: The middleware RBAC matrix (TC-1.5-03) is the most critical automated test here. Keycloak integration (the actual OIDC flow) is notoriously hard to E2E test robustly without flakiness due to redirects, so we rely heavily on unit/integration testing the mapping and middleware logic, and keep E2E tests focused on the result of a successful login.*
