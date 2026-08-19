# Test Plan — Story 8.9: Notifications Full Page

**Story:** 8-9-notifications-full-page
**Test Architect:** Murat (bmad-tea)
**Risk Level:** MEDIUM — role isolation and transport seam must not be mistaken for mock completion
**Test Strategy:** Component + Interaction for mock UI; API/SSE/TTS/security coverage is owned by Epic 9

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Mark All Read does not update DOM | Medium | Medium | State toggle assertion |
| Dot colors wrong tone | Low | Low | Class check per tone |
| Bell dropdown link not updated | Low | Low | href check on bell footer |
| Full page vs panel height overflow | Low | Low | .notif-list.full check |

---

## Test Cases

### T1: Page Renders (Smoke)
**Given:** Navigate to /manager/notifications
**Then:** h1 = Tat ca thong bao, 5 notification items present

### T2: Unread Items Highlighted
**Then:** First 2 items have .notif-item.unread class (background #f4f9f5)

### T3: Notification Dot Colors Correct
**Then:**
- Item 1 (Chi Lan da duyet) has .notif-dot.tone-green
- Item 2 (TP-021 chuyen sang) has .notif-dot.tone-amber
- Item 4 (Ban tin moi) has .notif-dot.tone-blue
- Item 5 (He thong) has .notif-dot.tone-neutral

### T4: Mark All Read Action
**Given:** Click Danh dau tat ca da doc
**Then:** All .notif-item.unread classes removed (0 unread items)

### T5: Full List Height (No Max-Height)
**Then:** .notif-list has .full class, no max-height limitation

### T6: Bell Dropdown Footer Link
**Then:** NotificationBell dropdown footer has link to /manager/notifications

### T7: Timestamp Visible
**Then:** Each notification has a small timestamp text visible

---

## Definition of Done

- [ ] T1 5 items render
- [ ] T2 Unread highlighted
- [ ] T3 Dot colors correct
- [ ] T4 Mark All Read works
- [ ] T5 Full list (no max-height)
- [ ] T6 Bell footer link updated
- [ ] T7 Timestamps visible
