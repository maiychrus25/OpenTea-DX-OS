# Test Plan — Story 8.2: Officer Today Dashboard

**Story:** 8-2-officer-today-dashboard
**Test Architect:** Murat (bmad-tea)
**Risk Level:** MEDIUM — FE prototype with role/navigation regression risk
**Test Strategy:** Smoke + Component; production data/authorization belongs to Epic 9 integration

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Wrong role sees officer dashboard | Medium | High | Middleware role check; test unauthenticated redirect |
| Metric values hardcoded wrong | Low | Low | Explicit value assertions |
| Badge not shown on nav | Medium | Low | Check navItems badge prop |
| Task table missing columns | Low | Medium | Column header check |

---

## Test Cases

### T1: Page Renders for Officer Role (Smoke)
**Given:** Officer user navigates to /officer/dashboard
**Then:** HTTP 200, h1 = Cong viec ky thuat hom nay

### T2: 4 Metric Cards Present
**Then:**
- Exactly 4 .metric-card elements
- Card 1 strong text = 05
- Card 2 strong text = 12
- Card 3 strong text = 04
- Card 4 strong text contains 14/18

### T3: Task Table Renders Correct Columns
**Then:**
- Table header contains: Thoi gian, Cong viec, Doi tuong, Trang thai
- 3 rows present

### T4: Status Pills Correct Tones
**Then:**
- Can xu ly row has amber pill
- Da xac nhan row has green pill
- muc cho row has blue pill

### T5: Sidebar Badge Shows Count
**Then:** Nav item Cong viec hom nay has child element with text 5

### T6: Manager Cannot Access Officer Dashboard
**Given:** Manager session
**When:** Navigate to /officer/dashboard
**Then:** Redirect to /manager/dashboard or 403

### T7: License Header + No Inline Styles (Code Review)

---

## Playwright Test Scaffold

`	ypescript
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License.

import { test, expect } from @playwright/test;

test.describe(Officer Dashboard 8.2, () => {
  test(T1 smoke render, async ({ page }) => {
    await page.goto(/officer/dashboard);
    await expect(page.locator(h1)).toContainText(Cong viec ky thuat hom nay);
  });

  test(T2 four metric cards, async ({ page }) => {
    await page.goto(/officer/dashboard);
    await expect(page.locator(.metric-card)).toHaveCount(4);
  });

  test(T3 task table columns, async ({ page }) => {
    await page.goto(/officer/dashboard);
    await expect(page.locator(.table-head)).toContainText(Thoi gian);
    await expect(page.locator(.table-row)).toHaveCount(3);
  });
});
`

---

## Definition of Done

- [ ] T1 Smoke pass
- [ ] T2 4 MetricCards with correct values
- [ ] T3 Task table 3 rows + headers
- [ ] T4 Status pills correct tones
- [ ] T5 Sidebar badge visible
- [ ] T6 Role-based access redirects correctly
- [ ] T7 Code quality checks pass
