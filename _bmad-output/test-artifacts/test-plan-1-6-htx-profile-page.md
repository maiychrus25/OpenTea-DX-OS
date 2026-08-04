# 🧪 Test Plan — Story 1.6: HTX Profile Page

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 1.6 — HTX Profile Page (Manager View)
**Date:** 2026-08-05
**Risk Level:** 🟡 MEDIUM — Standard CRUD operation, but introduces client-side forms and shared Zod validation. Key risk is failing to apply Zod correctly on both frontend and backend.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Backend bypasses Zod validation | LOW | HIGH | Unit test API route directly with invalid payload |
| Frontend form accepts invalid data | LOW | MEDIUM | React Testing Library unit tests for form validation |
| Unauthorized role can access PUT /api/profile | MEDIUM | HIGH | Integration test API with mock `OFFICER` session |
| Server Component data fetch fails | LOW | HIGH | Mock `GetHtxProfileUseCase` in tests |

---

## Test Strategy for Story 1.6

### Approach

1. **Unit (Domain):** Test the Zod schema directly.
2. **Unit (Frontend):** Test the `ProfileForm` component rendering and client-side validation using React Testing Library.
3. **Integration (Backend):** Test the `PUT /api/profile` route for validation, authorization, and use case invocation.
4. **E2E (Playwright):** A simple happy-path test of the "Read -> Edit -> Save" flow.

**Test files location:**
- `apps/web/src/__tests__/domain/schemas/`
- `apps/web/src/__tests__/presentation/components/`
- `apps/web/src/__tests__/presentation/api/`
- `apps/web/tests/e2e/profile/`

---

## Test Cases

### TC-1.6-01: Zod Schema Validation (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P0

```typescript
// __tests__/domain/schemas/htxProfileSchema.test.ts
import { htxProfileUpdateSchema } from '@/domain/schemas/htxProfileSchema'

describe('htxProfileUpdateSchema', () => {
  it('accepts valid data', () => {
    const validData = {
      name: 'HTX MD2',
      contact_email: 'test@example.com',
      contact_phone: '0901234567',
      // ...
    }
    expect(htxProfileUpdateSchema.safeParse(validData).success).toBe(true)
  })

  it('rejects invalid email', () => {
    const invalidData = { name: 'HTX', contact_email: 'not-an-email' }
    const result = htxProfileUpdateSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  it('rejects empty name', () => {
    const invalidData = { name: '' }
    expect(htxProfileUpdateSchema.safeParse(invalidData).success).toBe(false)
  })
})
```

**Pass Criteria:** Schema correctly validates expected shapes and rejects bad data.
**Fail Criteria:** Fails to reject bad data.

---

### TC-1.6-02: ProfileForm Client Validation (Unit)

**Type:** Unit
**Tool:** Jest + React Testing Library + user-event
**Priority:** P1

**Test Concept:**
Render `<ProfileForm initialData={mockData} />`. Click "Edit". Clear the required "Name" field. Click "Save". Assert that a validation error message appears and `fetch` is NOT called.

**Pass Criteria:** Client-side Zod validation prevents form submission.
**Fail Criteria:** Form submits with invalid data.

---

### TC-1.6-03: API Route Authorization & Validation (Integration)

**Type:** Integration
**Tool:** Jest (mocking Next.js Request and auth)
**Priority:** P0

**Test Concept:**
1. Call `PUT /api/profile` with `auth()` returning an `OFFICER` session. Assert 403 Forbidden.
2. Call `PUT /api/profile` with `auth()` returning a `MANAGER` session but an invalid JSON body. Assert 400 Bad Request (ValidationError).
3. Call `PUT /api/profile` with a valid body and `MANAGER` session. Assert 200 OK and that `UpdateHtxProfileUseCase` was called.

**Pass Criteria:** API correctly rejects unauthorized users and invalid payloads before executing business logic.
**Fail Criteria:** Allows unauthorized access or crashes on bad payloads.

---

### TC-1.6-04: E2E Happy Path (E2E)

**Type:** E2E
**Tool:** Playwright
**Priority:** P1

**Steps:**
1. Login as MANAGER.
2. Navigate to `/manager/profile`.
3. Assert page is in read-only mode (inputs are disabled or rendered as text).
4. Click "Sửa" (Edit).
5. Change the phone number.
6. Click "Lưu" (Save).
7. Assert success toast appears.
8. Refresh page.
9. Assert the new phone number is displayed.

**Pass Criteria:** End-to-end flow works seamlessly.
**Fail Criteria:** Any step fails.

---

## Test Execution Plan

```
P0 (blocking):
  TC-1.6-01 → TC-1.6-03

P1 (important):
  TC-1.6-02 → TC-1.6-04
```

---

## Definition of Done for Story 1.6

- [ ] `TC-1.6-01` PASS: Zod schema unit tests.
- [ ] `TC-1.6-02` PASS: React Hook Form integration tests.
- [ ] `TC-1.6-03` PASS: API route security & validation tests.
- [ ] `TC-1.6-04` PASS: E2E happy path.
- [ ] Committed with: `feat(profile): implement htx profile view and update for managers`

---

*🧪 Murat notes: This story introduces the shared validation pattern. Ensure the exact same Zod schema is used by `react-hook-form`'s resolver and the API route's body parsing logic.*
