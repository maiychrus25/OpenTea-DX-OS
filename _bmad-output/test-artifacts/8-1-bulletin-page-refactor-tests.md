# Test Plan — Story 8.1: Bulletin Page Refactor

**Story:** 8-1-bulletin-page-refactor
**Test Architect:** Murat (bmad-tea)
**Risk Level:** LOW — UI-only, mock data, no API calls
**Test Strategy:** Smoke + Component + Responsive

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Category pill wrong tone | Medium | Low | Verify pill class matches category mapping |
| AI disclaimer missing | Medium | Medium | Explicit AC-3 check |
| Audio button breaks SSR | Low | High | Extract to client component |
| Grid collapses wrong breakpoint | Low | Low | Responsive test at 1100px + 800px |

---

## Test Cases

### T1: Page Renders Without Errors (Smoke)
**Type:** Integration (next build + navigation)
**Given:** User navigates to /manager/bulletin
**Then:**
- Page returns HTTP 200
- h1 text includes Thong tin co nguon
- No JS runtime errors in console

### T2: 3-Card Grid Renders All 3 Categories
**Type:** Component (Playwright)
**Given:** Page loaded
**Then:**
- Exactly 3 .news-article cards rendered
- One card contains pill text Thi truong (pill-green class)
- One card contains pill text Thoi tiet (pill-blue class)
- One card contains pill text Ky thuat (pill-amber class)

### T3: Source Count Shows Per Card
**Type:** Component
**Then:**
- Each card has text matching /[0-9]+ nguon da kiem chung/
- Source count numbers match mock data (2, 3, 4)

### T4: AI Disclaimer Footer Present
**Type:** Component
**Then:**
- Element with AiNote pattern exists below cards
- Text contains Noi dung do AI tong hop
- Text contains khong phai khuyen nghi

### T5: Audio Button Renders
**Type:** Component
**Then:**
- Button with Nghe ban tin sang text exists in page header area
- Button does not throw error on click (no real audio expected in test)

### T6: Responsive — 1100px Breakpoint
**Type:** Visual/Responsive (Playwright viewport)
**Given:** Viewport width = 1050px
**Then:**
- Cards render in 2-column layout (not 3)

### T7: Responsive — 800px Breakpoint
**Type:** Visual/Responsive
**Given:** Viewport width = 750px
**Then:**
- Cards render in 1-column layout

### T8: No Inline Styles
**Type:** Code Review / Lint
**Then:**
- grep -r style={{ apps/web/src/app returns no results for bulletin files

### T9: License Header Present
**Type:** Code Review
**Then:**
- All new .tsx files contain Copyright (c) 2026 on line 1

---

## Playwright Test Scaffold

`	ypescript
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License.

import { test, expect } from @playwright/test;

test.describe(Bulletin Page 8.1, () => {
  test.beforeEach(async ({ page }) => {
    // TODO: mock auth session
    await page.goto(/manager/bulletin);
  });

  test(T1 page renders, async ({ page }) => {
    await expect(page.locator(h1)).toContainText(Thong tin co nguon);
  });

  test(T2 three category cards, async ({ page }) => {
    const cards = page.locator(.news-article);
    await expect(cards).toHaveCount(3);
  });

  test(T4 AI disclaimer, async ({ page }) => {
    await expect(page.locator(text=khong phai khuyen nghi)).toBeVisible();
  });

  test(T6 responsive 1100px, async ({ page }) => {
    await page.setViewportSize({ width: 1050, height: 768 });
    // grid should be 2-col: check computed style or count visible per row
  });
});
`

---

## Definition of Done

- [ ] T1 Smoke pass (npm run build + navigate)
- [ ] T2 3 cards with correct pill tones
- [ ] T3 Source counts visible
- [ ] T4 AI disclaimer present
- [ ] T5 Audio button renders
- [ ] T6 2-col at 1100px
- [ ] T7 1-col at 800px
- [ ] T8 No inline styles
- [ ] T9 License headers on new files
