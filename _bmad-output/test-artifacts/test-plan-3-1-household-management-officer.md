# 🧪 Test Plan — Story 3.1: Household Management

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 3.1 — Household Management (Officer)
**Date:** 2026-08-05
**Risk Level:** 🟢 LOW — Standard CRUD operation. Main risk is deleting a household that has dependent records.

---

## Testing Strategy & Setup

- **Tools:** Jest, Playwright, React Testing Library.
- **Database:** Integration tests must use the local PostgreSQL test instance. We will use Prisma's `$transaction` rollback mechanism or a dedicated seeded test DB to ensure test isolation.

---

## Detailed Test Cases

### TC-3.1-01: Delete Protection (Integration)

**Type:** Integration
**Tool:** Jest + Prisma
**Priority:** P0
**Target File:** `src/infrastructure/db/repositories/PrismaHouseholdRepository.test.ts` & `src/app/api/households/[id]/route.test.ts`

**Test Setup:**
1. Seed the database with a `Household` (ID: 'hh-1').
2. Seed the database with a `Parcel` (ID: 'p-1') linked to `Household` ('hh-1').

**Execution:**
1. Instantiate `PrismaHouseholdRepository`.
2. Call `repo.delete('hh-1')`.
3. Wrap the call in a `try/catch` block.

**Expected Results:**
- The repository must throw a specific custom error `HouseholdHasDependenciesError`.
- If testing via the Next.js API route (`DELETE /api/households/hh-1`), the route must return HTTP `400 Bad Request`.
- The response body MUST strictly match: `{ "error": "Không thể xóa nông hộ đang có thửa đất." }`.

### TC-3.1-02: RBAC Protection (Integration)

**Type:** Integration
**Tool:** Jest
**Priority:** P0
**Target File:** `src/app/api/households/route.test.ts`

**Test Setup:**
1. Use `jest.mock('next-auth/next')` to mock `getServerSession`.

**Execution:**
1. Mock the session to return `{ user: { role: 'FARMER' } }`.
2. Make a `POST` request to `/api/households`.
3. Make a `PUT` request to `/api/households/[id]`.
4. Make a `DELETE` request to `/api/households/[id]`.

**Expected Results:**
- ALL write operations must immediately return HTTP `403 Forbidden` without hitting the Prisma client.
- The response body should be standard `Forbidden`.

### TC-3.1-03: Zod Schema Validation (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P1
**Target File:** `src/domain/schemas/householdSchema.test.ts`

**Execution & Expectations:**
1. Pass `{ name: "A", phone: "0901234567" }` -> **FAIL** (Name must be at least 2 chars).
2. Pass `{ name: "Hùng", phone: "123" }` -> **FAIL** (Phone regex mismatch).
3. Pass `{ name: "Ông Nguyễn Văn A", phone: "0901234567" }` -> **PASS**.
4. Pass `{ name: "Bà B", phone: undefined }` -> **PASS** (Phone is optional).

### TC-3.1-04: UI Modal Submission (E2E)

**Type:** E2E
**Tool:** Playwright
**Priority:** P1
**Target File:** `tests/e2e/household/household-crud.spec.ts`

**Execution:**
1. Login as `OFFICER` via Playwright fixture.
2. Navigate to `/officer/households`.
3. Click button containing text "Thêm Nông Hộ".
4. Fill input `name="name"` with "Playwright Test".
5. Fill input `name="phone"` with "0987654321".
6. Click submit.

**Expected Results:**
- Modal closes.
- Toast notification appears saying "Thêm thành công".
- The new row "Playwright Test" appears in the table without requiring a manual page refresh (verifies SWR/React Query cache invalidation).

---

## Definition of Done

- [ ] `TC-3.1-01` PASS: Foreign key violation handled gracefully via Custom Error.
- [ ] `TC-3.1-02` PASS: Server-side RBAC enforced.
- [ ] `TC-3.1-03` PASS: Zod regex and length boundaries verified.
- [ ] `TC-3.1-04` PASS: End-to-end UI flow is smooth.
- [ ] Committed with: `feat(zone): implement household management crud for officer`
