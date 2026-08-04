# 🧪 Test Plan — Story 2.7: Web Bell Notification System

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 2.7 — Web Bell Notification System
**Date:** 2026-08-05
**Risk Level:** 🟢 LOW — Standard polling UI. Main risk is unnecessary DB load if the query is unoptimized or polling interval is too short.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| SWR polls too frequently | LOW | MEDIUM | Set SWR `refreshInterval: 60000` (1 minute) |
| Missing user isolation | LOW | HIGH | Unit test Use Case to ensure `userId` is passed |
| Mark as read fails | LOW | LOW | Integration test PUT route |

---

## Test Strategy for Story 2.7

### Approach

We will unit test the `NotificationBell` to ensure it renders correctly based on the mock SWR data. We will integration test the API route to ensure it filters by `user_id`.

**Test files location:**
- `apps/web/src/__tests__/presentation/components/features/notification/`
- `apps/web/src/__tests__/application/useCases/`

---

## Test Cases

### TC-2.7-01: NotificationBell Rendering (Unit)

**Type:** Unit
**Tool:** Jest + RTL
**Priority:** P1

**Test Concept:**
Mock `useSWR` to return `{ data: { notifications: [], unreadCount: 3 } }`. Render `<NotificationBell />`. Assert that a badge showing "3" is visible.

**Pass Criteria:** Unread count displays correctly.
**Fail Criteria:** Badge missing or shows wrong number.

### TC-2.7-02: User Isolation in Use Case (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P0

**Test Concept:**
Mock the Notification repository. Call `GetUserNotificationsUseCase.execute('user-A')`. Assert that the repository's `getUserNotifications` method is called with exactly `'user-A'`.

**Pass Criteria:** `user_id` is passed down correctly.
**Fail Criteria:** Fetches notifications for all users.

### TC-2.7-03: Mark As Read (Integration)

**Type:** Integration
**Tool:** Jest + Prisma
**Priority:** P0

**Test Concept:**
1. Seed a notification for the test user with `is_read = false`.
2. Send `PUT /api/notifications/read` with the notification ID.
3. Query the DB to assert `is_read = true`.

**Pass Criteria:** Record is updated.
**Fail Criteria:** Record remains unread or updates wrong record.

---

## Test Execution Plan

```
P0: TC-2.7-02 → TC-2.7-03
P1: TC-2.7-01
```

---

## Definition of Done for Story 2.7

- [ ] `TC-2.7-01` PASS: Bell component UI tested.
- [ ] `TC-2.7-02` PASS: Use case user isolation tested.
- [ ] `TC-2.7-03` PASS: Mark as read endpoint tested.
- [ ] Manual check: Wait 60 seconds and ensure the polling network request happens.
- [ ] Committed with: `feat(notification): implement web bell notification system with polling`
