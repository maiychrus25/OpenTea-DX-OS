# Test Plan — Story 8.8: Account & Profile Page

**Story:** 8-8-account-profile-page
**Test Architect:** Murat (bmad-tea)
**Risk Level:** LOW — Static profile display
**Test Strategy:** Component + Security

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Logout exposes session token in URL | High | Critical | POST logout, never GET |
| Profile edit routes to wrong page | Low | Low | href check |
| Initials crash on empty userName | Medium | Medium | Guard test with empty name |

---

## Test Cases

### T1: Page Renders (Smoke)
**Given:** Authenticated user navigates to /manager/profile (or equivalent)
**Then:** h1 includes Thong tin ca nhan, avatar circle renders

### T2: Profile Section Fields
**Then:** User name, role label, email visible. Edit button exists.

### T3: HTX Info Section
**Then:** HTX name visible (HTX Rau an toan Tan Phu), public link button Xem trang cong khai

### T4: Security Rows (3 items)
**Then:**
- Van tay / FaceID row with Dang su dung badge
- Ma PIN 6 so row with Doi PIN button
- Thiet bi dang nhap row with Quan ly button

### T5: Logout Button Visible
**Then:** Dang xuat button or link present at bottom of page

### T6: Logout Does Not GET with Token
**Then:** Logout click triggers POST or router.push to /login (not a GET href with token)

### T7: Empty UserName Guard
**Given:** userName prop is empty string
**Then:** Avatar circle shows U fallback, no crash

### T8: Unauthenticated Redirect
**Given:** No session
**Then:** Redirect to /login (server-side redirect)

---

## Definition of Done

- [ ] T1 Page renders
- [ ] T2 Profile fields
- [ ] T3 HTX info
- [ ] T4 3 security rows
- [ ] T5 Logout button
- [ ] T6 Logout security (no GET with token)
- [ ] T7 Empty name guard
- [ ] T8 Unauthenticated redirect
