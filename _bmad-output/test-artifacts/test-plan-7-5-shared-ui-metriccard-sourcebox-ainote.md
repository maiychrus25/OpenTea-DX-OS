# 🧪 Test Plan — Story 7.5: Shared UI — MetricCard, SourceBox, AiNote

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 7.5 — Shared UI: MetricCard, SourceBox, AiNote
**Date:** 2026-08-14
**Risk Level:** 🟢 LOW-MEDIUM — Components mới, ít regression risk. Rủi ro chính là AI Invariant compliance: AiNote bị thiếu ở các nơi cần có.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AiNote thiếu trong AI output pages | MEDIUM | HIGH | JSDoc enforcement + code review checklist |
| SourceBox thiếu trong market data pages | MEDIUM | HIGH | JSDoc enforcement + code review checklist |
| MetricCard tone style sai màu | LOW | LOW | Unit test class assertion |
| Icon import lỗi (lucide-react) | LOW | MEDIUM | Build check |

---

## Test Cases

### TC-7.5-01: MetricCard Renders with Required Props (Unit)

**Type:** Unit
**Tool:** Jest + React Testing Library
**Priority:** P0

```typescript
// __tests__/components/ui/MetricCard.test.tsx
import { MetricCard } from '@/components/ui'
import { Sprout } from 'lucide-react'

test('MetricCard renders label and value', () => {
  render(
    <MetricCard icon={<Sprout />} label="Vùng canh tác" value="12 ha" detail="Đang hoạt động" />
  )
  expect(screen.getByText('Vùng canh tác')).toBeInTheDocument()
  expect(screen.getByText('12 ha')).toBeInTheDocument()
  expect(screen.getByText('Đang hoạt động')).toBeInTheDocument()
})

test('MetricCard applies tone class', () => {
  const { container } = render(
    <MetricCard icon={<Sprout />} label="Test" value="0" tone="amber" />
  )
  expect(container.firstChild).toHaveClass('amber')
})

test('MetricCard detail is optional', () => {
  render(<MetricCard icon={<Sprout />} label="Test" value="5" />)
  expect(screen.getByText('Test')).toBeInTheDocument()
})
```

---

### TC-7.5-02: SourceBox Renders Source List (Unit)

**Type:** Unit
**Tool:** Jest + React Testing Library
**Priority:** P0

```typescript
// __tests__/components/ui/SourceBox.test.tsx
import { SourceBox } from '@/components/ui'

test('SourceBox renders count and sources', () => {
  render(<SourceBox count={3} sources={['VietGAP', 'Sở NN&PTNT', 'Chợ đầu mối']} />)
  expect(screen.getByText(/3 nguồn đã kiểm chứng/)).toBeInTheDocument()
  expect(screen.getByText(/VietGAP/)).toBeInTheDocument()
  expect(screen.getByText(/Chợ đầu mối/)).toBeInTheDocument()
})
```

---

### TC-7.5-03: AiNote Renders Default Message (Unit)

**Type:** Unit
**Tool:** Jest + React Testing Library
**Priority:** P0

```typescript
// __tests__/components/ui/AiNote.test.tsx
import { AiNote } from '@/components/ui'

test('AiNote renders default disclaimer', () => {
  render(<AiNote />)
  expect(screen.getByText(/AI tổng hợp dữ liệu/)).toBeInTheDocument()
  expect(screen.getByText(/không đưa ra khuyến nghị/)).toBeInTheDocument()
})

test('AiNote renders custom message', () => {
  render(<AiNote message="Kết quả chẩn đoán chỉ mang tính tham khảo." />)
  expect(screen.getByText(/Kết quả chẩn đoán/)).toBeInTheDocument()
})
```

---

### TC-7.5-04: All Three Components Exported from ui/index (Unit)

**Type:** Static / Import
**Tool:** Jest
**Priority:** P1

```typescript
import * as UI from '@/components/ui'

test('MetricCard exported', () => { expect(UI.MetricCard).toBeDefined() })
test('SourceBox exported', () => { expect(UI.SourceBox).toBeDefined() })
test('AiNote exported', () => { expect(UI.AiNote).toBeDefined() })
```

---

### TC-7.5-05: AI Invariant — AiNote Must Appear in Bulletin Page (Compliance Check)

**Type:** E2E
**Tool:** Playwright
**Priority:** P0

**Context:** Story 7.8 (Manager Dashboard) renders market snapshot with AI-generated summary. This test validates the invariant is met.

```typescript
// Run AFTER story 7-8 is implemented
test('bulletin/market section has AiNote disclaimer', async ({ page }) => {
  await loginAsManager(page)
  await page.goto('/manager/dashboard')
  // AiNote text must be visible on page
  await expect(page.getByText(/AI tổng hợp dữ liệu/)).toBeVisible()
})
```

**Note:** TC-7.5-05 phụ thuộc story 7-8. Mark as PENDING cho đến khi 7-8 done.

---

## Test Execution Plan

```
P0 (blocking — run in story 7-5):
  TC-7.5-01: MetricCard unit
  TC-7.5-02: SourceBox unit
  TC-7.5-03: AiNote unit

P1 (run in story 7-5):
  TC-7.5-04: Exports check

P0 deferred (run in story 7-8):
  TC-7.5-05: AI Invariant compliance
```

---

## Definition of Done for Story 7.5

- [ ] `TC-7.5-01` PASS: MetricCard renders and tones work
- [ ] `TC-7.5-02` PASS: SourceBox renders sources correctly
- [ ] `TC-7.5-03` PASS: AiNote renders default and custom messages
- [ ] `TC-7.5-04` PASS: All 3 components exported from ui/index
- [ ] `TC-7.5-05` deferred to story 7-8
- [ ] `npm run build` pass
- [ ] Committed với: `feat(ui): add MetricCard, SourceBox, and AiNote components`

---

*🧪 Murat notes: SourceBox và AiNote là components thực thi AI Invariant của dự án. Chúng không chỉ là UI — chúng là compliance controls. Code review PHẢI kiểm tra: mọi trang hiển thị market data đều có SourceBox, mọi trang AI output đều có AiNote.*
