# 🧪 Test Plan — Story 7.7: Manager Dashboard Today View

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 7.7 — Manager Dashboard Today View
**Date:** 2026-08-14
**Risk Level:** 🟠 HIGH — Server Component với DB queries và AI Invariant compliance. Rủi ro: metric queries fail với empty DB, SourceBox/AiNote bị thiếu.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| DB query fail → page crash | MEDIUM | HIGH | try/catch + fallback 0 values |
| SourceBox missing in market section | MEDIUM | CRITICAL | E2E text assertion |
| AiNote missing in market section | MEDIUM | CRITICAL | E2E text assertion (AI Invariant) |
| Metric grid wraps on small desktop | LOW | MEDIUM | E2E 1100px viewport |
| Onboarding CTA disappears | LOW | HIGH | Unit test: no profile → CTA visible |

---

## Test Cases

### TC-7.7-01: Dashboard Renders Hero Panel (E2E)

**Type:** E2E
**Tool:** Playwright
**Priority:** P0

```typescript
test('manager dashboard shows hero greeting', async ({ page }) => {
  await loginAsManager(page)
  await page.goto('/manager/dashboard')
  // Greeting text (partial — time-aware)
  await expect(page.getByText(/Chào buổi/)).toBeVisible()
  // Operational pill
  await expect(page.getByText('Đang hoạt động')).toBeVisible()
})
```

---

### TC-7.7-02: Metric Grid Shows 4 Cards (E2E)

**Type:** E2E
**Tool:** Playwright
**Priority:** P1

```typescript
test('manager dashboard shows 4 metric cards', async ({ page }) => {
  await loginAsManager(page)
  await page.goto('/manager/dashboard')
  const cards = page.locator('[data-testid="metric-card"]')
  await expect(cards).toHaveCount(4)
})
```

**Note:** MetricCard cần có `data-testid="metric-card"` attribute.

---

### TC-7.7-03: AI Invariant — AiNote Present in Market Section (E2E)

**Type:** E2E — AI Invariant compliance
**Tool:** Playwright
**Priority:** P0 — CRITICAL

```typescript
test('market snapshot section contains AiNote disclaimer', async ({ page }) => {
  await loginAsManager(page)
  await page.goto('/manager/dashboard')
  await expect(page.getByText(/AI tổng hợp dữ liệu/)).toBeVisible()
})
```

---

### TC-7.7-04: SourceBox Present in Market Section (E2E)

**Type:** E2E — AI Invariant compliance
**Tool:** Playwright
**Priority:** P0 — CRITICAL

```typescript
test('market snapshot section contains SourceBox', async ({ page }) => {
  await loginAsManager(page)
  await page.goto('/manager/dashboard')
  await expect(page.getByText(/nguồn đã kiểm chứng/)).toBeVisible()
})
```

---

### TC-7.7-05: Onboarding CTA When No Profile (Unit)

**Type:** Unit
**Tool:** Jest
**Priority:** P0

```typescript
// Mock GetHtxProfileUseCase to throw NotFoundError
jest.mock('@/application/useCases/GetHtxProfileUseCase', () => ({
  GetHtxProfileUseCase: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockRejectedValue(new NotFoundError('profile')),
  })),
}))

test('shows onboarding CTA when no HTX profile', async () => {
  render(await ManagerDashboard())
  expect(screen.getByText(/Chưa thiết lập Hợp tác xã/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Thiết lập ngay/ })).toBeInTheDocument()
})
```

---

### TC-7.7-06: Metric Grid Responsive at 1100px (E2E)

**Type:** E2E
**Tool:** Playwright — 1100px viewport
**Priority:** P1

```typescript
test('metric grid wraps to 2 cols at 1100px', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } })
  const page = await ctx.newPage()
  await loginAsManager(page)
  await page.goto('/manager/dashboard')
  // Grid should have 2 columns — check first card's position
  const cards = await page.locator('[data-testid="metric-card"]').all()
  const first = await cards[0].boundingBox()
  const third = await cards[2].boundingBox()
  // Third card should be on a new row (different top position)
  expect(third!.y).toBeGreaterThan(first!.y + 50)
  await ctx.close()
})
```

---

## Test Execution Plan

```
P0 (blocking):
  TC-7.7-01: Hero panel
  TC-7.7-03: AiNote AI Invariant
  TC-7.7-04: SourceBox AI Invariant
  TC-7.7-05: Onboarding CTA

P1 (important):
  TC-7.7-02: 4 metric cards
  TC-7.7-06: Responsive grid
```

---

## Definition of Done for Story 7.7

- [ ] `TC-7.7-01` PASS: Hero greeting visible
- [ ] `TC-7.7-02` PASS: 4 metric cards
- [ ] `TC-7.7-03` PASS: AiNote present (AI Invariant)
- [ ] `TC-7.7-04` PASS: SourceBox present (data citation)
- [ ] `TC-7.7-05` PASS: Onboarding CTA when no profile
- [ ] `TC-7.7-06` PASS: Responsive at 1100px
- [ ] `npm run build` pass
- [ ] Committed với: `feat(dashboard): implement manager today view with metrics and market snapshot`

---

*🧪 Murat notes: TC-7.7-03 và TC-7.7-04 là AI Invariant tests — P0 absolute blocks. Nếu thiếu AiNote hoặc SourceBox thì story KHÔNG được merge dù mọi thứ khác pass.*
